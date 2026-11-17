import { db, getActivity, getToday, getUpdate, runCommand } from "@nomeet/db";
import { blankUpdate, localTime, shiftDay, type Command } from "@nomeet/domain";
import { afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { publishDigest, sendReminders, startJobs, connection } from "../apps/worker/src/jobs";
import type { WorkerConfig } from "../apps/worker/src/config";
import { QueueEvents } from "bullmq";

const env: WorkerConfig = { APP_URL: "http://127.0.0.1:3000", REDIS_URL: process.env.REDIS_URL ?? "redis://127.0.0.1:6379", JOB_QUEUE: `test-${randomUUID()}` };
type Result = { workspaceId?: string; token?: string; id?: string; version?: number };
async function command(user: string, data: Command, at?: Date) {
  return await runCommand(user, data, at) as Result;
}

const zone = "America/Chicago";
async function team(timezone = zone) {
  const tag = randomUUID();
  const [lead, member, outsider] = await Promise.all(["lead", "member", "outsider"].map(name => db.user.create({ data: { name, email: `${name}-${tag}@example.test` } })));
  const { workspaceId } = await command(lead.id, { action: "workspace", name: "Test workspace", timezone });
  const { token } = await command(lead.id, { action: "invite", workspaceId: workspaceId!, email: member.email });
  return { workspaceId: workspaceId!, token: token!, lead, member, outsider };
}

describe.runIf(process.env.RUN_DB_TESTS === "1")("PostgreSQL workflows", () => {
  afterAll(() => db.$disconnect());

  it("redeems an email-bound invite once and enforces role boundaries", async () => {
    const { workspaceId, token, lead, member, outsider } = await team();
    await expect(command(outsider.id, { action: "join", token })).rejects.toMatchObject({ status: 400 });
    await expect(command(member.id, { action: "join", token })).resolves.toMatchObject({ workspaceId });
    await expect(command(member.id, { action: "join", token })).rejects.toMatchObject({ status: 400 });
    await expect(command(member.id, { action: "invite", workspaceId, email: outsider.email })).rejects.toMatchObject({ status: 403 });
    await expect(command(lead.id, { action: "membership", workspaceId, userId: member.id, role: "ADMIN" })).resolves.toEqual({});
    await expect(command(member.id, { action: "invite", workspaceId, email: outsider.email })).resolves.toHaveProperty("token");
  });

  it("isolates tenant reads, mutations, and foreign references", async () => {
    const a = await team();
    const b = await team();
    const day = localTime(new Date(), zone).day;
    const update = await command(a.lead.id, { action: "standup", workspaceId: a.workspaceId, day, version: 0, draftVersion: 0, content: { ...blankUpdate, done: "Confidential feature" }, trackBlocker: false });
    await expect(getActivity(a.workspaceId, b.lead.id)).rejects.toMatchObject({ status: 404 });
    await expect(getUpdate(b.workspaceId, b.lead.id, update.id!)).rejects.toMatchObject({ status: 404 });
    await expect(command(b.lead.id, { action: "blocker", workspaceId: b.workspaceId, sourceId: update.id!, severity: "NORMAL", title: "Wrong workspace" })).rejects.toMatchObject({ status: 404 });
    await expect(command(b.lead.id, { action: "standup", workspaceId: a.workspaceId, day, version: 1, draftVersion: 0, content: { ...blankUpdate, done: "Overwrite" }, trackBlocker: false })).rejects.toMatchObject({ status: 404 });
    const blocker = await db.blocker.create({ data: { workspaceId: b.workspaceId, title: "Valid blocker in B", fingerprint: "tenant-test" } });
    await expect(db.blockerSource.create({ data: { workspaceId: b.workspaceId, blockerId: blocker.id, standupId: update.id! } })).rejects.toMatchObject({ code: "P2003" });
  });

  it("collapses repeated blockers and carries outstanding commitments into the next local day", async () => {
    const { workspaceId, lead, member, token } = await team();
    await command(member.id, { action: "join", token });
    const today = localTime(new Date(), zone).day;
    const yesterday = shiftDay(today, -1);
    const yesterdayPost = await command(lead.id, { action: "standup", workspaceId, day: yesterday, version: 0, draftVersion: 0, trackBlocker: true, content: { ...blankUpdate, done: "Initial integration", impediments: "Missing Staging Key" } });
    await command(member.id, { action: "standup", workspaceId, day: today, version: 0, draftVersion: 0, trackBlocker: true, content: { ...blankUpdate, next: "Test integration", impediments: "missing   staging key" } });
    const blockers = await db.blocker.findMany({ where: { workspaceId }, include: { sources: true } });
    expect(blockers).toHaveLength(1);
    expect(blockers[0].sources).toHaveLength(2);
    await command(lead.id, { action: "blockerChange", workspaceId, id: blockers[0].id, version: 1, ownerId: member.id, status: "OPEN", severity: "HIGH" });
    await command(member.id, { action: "blockerChange", workspaceId, id: blockers[0].id, version: 2, ownerId: member.id, status: "RESOLVED", severity: "HIGH" });
    expect(await db.blocker.findUnique({ where: { id: blockers[0].id } })).toMatchObject({ status: "RESOLVED", resolvedAt: expect.any(Date) });
    const item = await command(lead.id, { action: "commitment", workspaceId, ownerId: lead.id, sourceId: yesterdayPost.id!, dueDay: shiftDay(today, 1), description: "Verify delivery" });
    expect((await getToday(workspaceId, lead.id, today)).outstanding.map(row => row.id)).toContain(item.id);
    await command(lead.id, { action: "commitmentChange", workspaceId, id: item.id!, version: 1, ownerId: lead.id, dueDay: shiftDay(today, 1), status: "COMPLETED" });
    expect((await getToday(workspaceId, lead.id, today)).outstanding).toHaveLength(0);
    expect(await db.commitmentChange.count({ where: { workspaceId, commitmentId: item.id } })).toBe(2);
  });

  it("preserves one version and one audit entry after concurrent edits", async () => {
    const { workspaceId, lead } = await team();
    const day = localTime(new Date(), zone).day;
    const input = { action: "standup" as const, workspaceId, day, version: 0, draftVersion: 0, trackBlocker: false };
    const original = await command(lead.id, { ...input, content: { ...blankUpdate, done: "First" } });
    const results = await Promise.allSettled(["Edit A", "Edit B"].map(done => command(lead.id, { ...input, version: 1, content: { ...blankUpdate, done } })));
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find(result => result.status === "rejected")).toMatchObject({ reason: { status: 409 } });
    const row = await db.standup.findUniqueOrThrow({ where: { id: original.id }, include: { revisions: { orderBy: { version: "asc" } } } });
    expect(row.version).toBe(2);
    expect(row.revisions.map(item => item.snapshot)).toEqual([{ ...blankUpdate, done: "First" }, { ...blankUpdate, done: row.done }]);
    await expect(command(lead.id, { action: "draft", workspaceId, day, version: 0, standupVersion: 1, content: blankUpdate })).rejects.toMatchObject({ status: 409 });
  });

  it("skips early reminders and deduplicates a repeated scheduled run", async () => {
    const { workspaceId, lead, member, token } = await team("Europe/Paris");
    await command(member.id, { action: "join", token });
    const day = "2026-11-17";
    const early = new Date("2026-11-17T08:59:00Z");
    const due = new Date("2026-11-17T09:01:00Z");
    await sendReminders(workspaceId, day, early);
    expect(await db.notification.count({ where: { workspaceId } })).toBe(0);
    await Promise.all([sendReminders(workspaceId, day, due), sendReminders(workspaceId, day, due)]);
    expect(await db.notification.count({ where: { workspaceId, userId: member.id } })).toBe(1);
    expect(await db.notification.count({ where: { workspaceId, userId: lead.id } })).toBe(1);
  });

  it("publishes a source-linked digest and accepts new standups after Gemini fails", async () => {
    const { workspaceId, lead } = await team();
    await db.workspace.update({ where: { id: workspaceId }, data: { aiEnabled: true } });
    const day = localTime(new Date(), zone).day;
    const content = { ...blankUpdate, done: "Deployed to staging" };
    const input = { action: "standup" as const, workspaceId, day, version: 0, draftVersion: 0, content, trackBlocker: false };
    const { id } = await command(lead.id, input);
    let attempts = 0;
    const provider = async () => { attempts++; return new Response(null, { status: 503 }); };
    await publishDigest({ ...env, GEMINI_API_KEY: "fake-test-key", GEMINI_MODEL: "fake-test-model" }, workspaceId, day, "daily", provider);
    expect(attempts).toBe(2);
    const saved = await db.digest.findFirstOrThrow({ where: { workspaceId, day } });
    expect(saved).toMatchObject({ ai: null, content: { updates: [{ id, done: content.done }] } });
    expect(await db.notification.count({ where: { workspaceId, key: `digest:daily:${day}` } })).toBe(1);
    await expect(command(lead.id, { ...input, version: 1, content: { ...content, next: "Roll out to pilot" } })).resolves.toMatchObject({ version: 2 });
  });

  it.runIf(process.env.RUN_REDIS_TESTS === "1")("executes BullMQ digest jobs with stable notification effects", async () => {
    const { workspaceId } = await team();
    const runtime = await startJobs(env);
    const redis = connection(env);
    const events = new QueueEvents(env.JOB_QUEUE, { connection: redis });
    try {
      await events.waitUntilReady();
      const day = localTime(new Date(), zone).day;
      for (const jobId of ["attempt-one", "attempt-two"]) {
        const item = await runtime.queue.add("digest", { workspaceId, day, period: "daily" }, { jobId });
        await item.waitUntilFinished(events, 7000);
      }
      expect(await db.digest.count({ where: { workspaceId, day, period: "daily" } })).toBe(1);
      expect(await db.notification.count({ where: { workspaceId, key: `digest:daily:${day}` } })).toBe(1);
    } finally {
      await events.close();
      redis.disconnect();
      await runtime.worker.close();
      await runtime.queue.obliterate({ force: true });
      await runtime.close();
    }
  });
});
