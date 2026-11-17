import { atomic, buildDigest, db, notify, type Period } from "@nomeet/db";
import { daySchema, localTime, log, scheduled } from "@nomeet/domain";
import { trace } from "@opentelemetry/api";
import { Queue, Worker, type JobsOptions } from "bullmq";
import IORedis from "ioredis";
import nodemailer from "nodemailer";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { WorkerConfig } from "./config";
import { intelligence } from "./intelligence";

const options: JobsOptions = {
  attempts: 6,
  backoff: { type: "exponential", delay: 5000 },
  removeOnComplete: { age: 3 * 86400, count: 100_000 },
  removeOnFail: { age: 14 * 86400, count: 10_000 },
};
const dailyData = z.object({ workspaceId: z.string(), day: daySchema });
const leaseMs = 5 * 60_000;

export function connection(env: WorkerConfig) {
  return new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });
}

export async function sendReminders(workspaceId: string, day: string, now = new Date()) {
  await atomic(async tx => {
    const workspace = await tx.workspace.findUnique({ where: { id: workspaceId } });
    if (!workspace || day !== scheduled(now, workspace.timezone, workspace.weekdays, workspace.reminderTime)) return;
    const [members, updates, blockers] = await Promise.all([
      tx.membership.findMany({ where: { workspaceId, removedAt: null, reminders: true } }),
      tx.standup.findMany({ where: { workspaceId, day }, select: { authorId: true } }),
      tx.blocker.findMany({ where: { workspaceId, status: "OPEN", createdAt: { lte: new Date(now.getTime() - 86400_000) } }, orderBy: { createdAt: "asc" } }),
    ]);
    const authors = new Set(updates.map(row => row.authorId));
    for (const member of members) {
      if (!authors.has(member.userId)) await notify(tx, workspaceId, member.userId, `standup:${day}`, "Your standup is due", "today");
      const followups = blockers.filter(blocker => blocker.ownerId ? blocker.ownerId === member.userId : member.role !== "MEMBER");
      if (followups.length) {
        await notify(tx, workspaceId, member.userId, `followups:${day}`,
          followups.length === 1 ? `Still open: ${followups[0].title}` : `${followups.length} blockers need follow-up`,
          followups.length === 1 ? `blockers#${followups[0].id}` : "blockers");
      }
    }
  });
}

export async function publishDigest(env: WorkerConfig, workspaceId: string, day: string, period: Period, fetcher = fetch) {
  const where = { workspaceId_period_day: { workspaceId, day, period } };
  const workspace = await db.workspace.findUnique({ where: { id: workspaceId } });
  if (!workspace || await db.digest.findUnique({ where })) return;
  const content = await db.$transaction(tx => buildDigest(tx, workspaceId, period, day), { isolationLevel: "RepeatableRead" });
  let ai: Awaited<ReturnType<typeof intelligence>>;
  if (workspace.aiEnabled) {
    try { ai = await intelligence(env, workspaceId, content, fetcher); }
    catch { log("warn", "gemini.unavailable", { workspaceId, day, period }); }
  }

  await atomic(async tx => {
    const current = await tx.workspace.findUnique({ where: { id: workspaceId } });
    if (!current) return;
    const inserted = await tx.digest.createMany({ data: [{ workspaceId, day, period, content, ...(current.aiEnabled && ai ? { ai } : {}) }], skipDuplicates: true });
    if (!inserted.count) return;
    const leads = await tx.membership.findMany({ where: { workspaceId, removedAt: null, role: { in: ["OWNER", "ADMIN"] } } });
    for (const lead of leads) await notify(tx, workspaceId, lead.userId, `digest:${period}:${day}`,
      `${period === "daily" ? "Daily" : "Weekly"} digest · ${content.updates.length} ${content.updates.length === 1 ? "update" : "updates"}`, `digest?period=${period}&day=${day}`);
  });
}

async function plan(queue: Queue, now = new Date()) {
  let cursor: string | undefined;
  do {
    const workspaces = await db.workspace.findMany({ take: 100, orderBy: { id: "asc" }, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) });
    const jobs: { name: string; data: object; opts: JobsOptions }[] = [];
    for (const workspace of workspaces) {
      const reminderDay = scheduled(now, workspace.timezone, workspace.weekdays, workspace.reminderTime);
      if (reminderDay) jobs.push({ name: "reminders", data: { workspaceId: workspace.id, day: reminderDay }, opts: { jobId: `reminders-${workspace.id}-${reminderDay}` } });
      const digestDay = scheduled(now, workspace.timezone, workspace.weekdays, workspace.digestTime);
      if (digestDay) {
        const periods = localTime(now, workspace.timezone).weekday === Math.max(...workspace.weekdays) ? ["daily", "weekly"] : ["daily"];
        for (const period of periods) jobs.push({ name: "digest", data: { workspaceId: workspace.id, day: digestDay, period }, opts: { jobId: `digest-${workspace.id}-${digestDay}-${period}` } });
      }
    }
    if (jobs.length) await queue.addBulk(jobs);
    cursor = workspaces.length === 100 ? workspaces.at(-1)?.id : undefined;
  } while (cursor);

  const pending = await db.notification.findMany({
    where: { OR: [{ mailState: "PENDING" }, { mailState: "SENDING", mailClaimedAt: { lt: new Date(now.getTime() - leaseMs) } }] },
    select: { id: true }, orderBy: { createdAt: "asc" }, take: 200,
  });
  if (pending.length) await queue.addBulk(pending.map(({ id }) => ({ name: "mail", data: { id }, opts: { jobId: `mail-${id}`, removeOnComplete: true } })));
  await db.rateBucket.deleteMany({ where: { window: { lt: new Date(now.getTime() - 7 * 86400_000) } } });
}

export async function startJobs(env: WorkerConfig) {
  const redis = connection(env);
  redis.on("error", error => log("error", "redis.error", { errorType: error.constructor.name }));
  const queue = new Queue(env.JOB_QUEUE, { connection: redis, defaultJobOptions: options });
  const smtp = env.SMTP_URL ? nodemailer.createTransport({
    url: env.SMTP_URL,
    requireTLS: process.env.NODE_ENV === "production",
    disableFileAccess: true,
    disableUrlAccess: true,
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 30000,
  }) : undefined;

  async function mail(id: string, finalAttempt: boolean) {
    const at = new Date();
    const token = randomUUID();
    const claimed = await db.notification.updateMany({
      where: { id, OR: [{ mailState: "PENDING" }, { mailState: "SENDING", mailClaimedAt: { lt: new Date(at.getTime() - leaseMs) } }] },
      data: { mailState: "SENDING", mailClaimedAt: at, mailClaimToken: token },
    });
    if (!claimed.count) return;
    const where = { id, mailClaimToken: token };
    try {
      const notice = await db.notification.findUniqueOrThrow({ where: { id }, include: { member: { include: { user: true } } } });
      const send = smtp && !notice.member.removedAt && notice.member.emailOptIn;
      if (send) await smtp.sendMail({
        from: env.MAIL_FROM, to: notice.member.user.email, subject: notice.title.replace(/[\r\n]/g, " ").slice(0, 180),
        text: `${notice.title}\n\n${new URL(`/w/${notice.workspaceId}/${notice.path}`, env.APP_URL)}`,
        messageId: `<${id}@${new URL(env.APP_URL).hostname}>`,
      });
      await db.notification.updateMany({ where, data: { mailState: send ? "SENT" : "SUPPRESSED", mailClaimedAt: null, mailClaimToken: null } });
    } catch (error) {
      await db.notification.updateMany({ where, data: { mailState: finalAttempt ? "FAILED" : "PENDING", mailClaimedAt: null, mailClaimToken: null } });
      throw error;
    }
  }

  const worker = new Worker(env.JOB_QUEUE, job => trace.getTracer("nomeet.worker").startActiveSpan(`job.${job.name}`, async span => {
    span.setAttribute("messaging.message.id", job.id ?? "");
    try {
      switch (job.name) {
        case "plan": return await plan(queue);
        case "reminders": {
          const { workspaceId, day } = dailyData.parse(job.data);
          return await sendReminders(workspaceId, day);
        }
        case "digest": {
          const { workspaceId, day, period } = dailyData.extend({ period: z.enum(["daily", "weekly"]) }).parse(job.data);
          return await publishDigest(env, workspaceId, day, period);
        }
        case "mail": return await mail(z.object({ id: z.string() }).parse(job.data).id, job.attemptsMade + 1 >= (job.opts.attempts ?? 1));
        default: throw new Error("Unknown job");
      }
    } finally { span.end(); }
  }), { connection: redis, concurrency: 4 });
  worker.on("completed", job => log("info", "job.completed", { id: job.id, name: job.name, attempts: job.attemptsMade }));
  worker.on("failed", (job, error) => log("warn", "job.failed", { id: job?.id, name: job?.name, attempts: job?.attemptsMade, errorType: error.constructor.name }));
  worker.on("error", error => log("error", "worker.error", { errorType: error.constructor.name }));
  try { await queue.upsertJobScheduler("minute-plan", { every: 60_000 }, { name: "plan", data: {}, opts: options }); }
  catch (error) { await worker.close(); await queue.close(); redis.disconnect(); throw error; }
  return { queue, worker, async close() { await worker.close(); await queue.close(); await redis.quit(); } };
}
