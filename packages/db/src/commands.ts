import { Prisma } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { localTime, shiftDay, type Command } from "@nomeet/domain";
import { AppError, db, hash } from "./client";

type Tx = Prisma.TransactionClient;
const conflict = () => new AppError(409, "This changed in another tab. Reload and try again.");
const forbidden = () => new AppError(403, "You do not have permission to do that.");
const missing = () => new AppError(404, "That item could not be found.");

export async function atomic<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.$transaction(fn, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError)) throw error;
      if (error.code === "P2002") throw conflict();
      if (error.code !== "P2034") throw error;
      if (attempt === 3) throw conflict();
      await new Promise(resolve => setTimeout(resolve, 10 * 2 ** attempt));
    }
  }
}

export async function membership(tx: Tx, workspaceId: string, userId: string) {
  const item = await tx.membership.findFirst({ where: { workspaceId, userId, removedAt: null }, include: { workspace: true } });
  if (!item) throw missing();
  return item;
}

async function source(tx: Tx, workspaceId: string, id: string) {
  const update = await tx.standup.findUnique({ where: { workspaceId_id: { workspaceId, id } } });
  if (!update) throw missing();
  return update;
}

async function activity(tx: Tx, workspaceId: string, actorId: string, kind: string, label: string, path: string) {
  await tx.activity.create({ data: { workspaceId, actorId, kind, label, path } });
}

export async function notify(tx: Tx, workspaceId: string, userId: string, key: string, title: string, path: string) {
  const member = await tx.membership.findFirst({ where: { workspaceId, userId, removedAt: null } });
  if (!member) return;
  await tx.notification.createMany({
    data: [{ workspaceId, userId, key, title, path, mailState: member.emailOptIn ? "PENDING" : "NONE" }],
    skipDuplicates: true,
  });
}

async function trackBlocker(tx: Tx, workspaceId: string, actorId: string, standupId: string, title: string, severity: "LOW" | "NORMAL" | "HIGH") {
  const fingerprint = hash(title.normalize("NFKC").toLowerCase().trim().replace(/\s+/g, " "));
  const inserted = await tx.blocker.createMany({ data: [{ workspaceId, title, fingerprint, severity }], skipDuplicates: true });
  const blocker = await tx.blocker.findUniqueOrThrow({ where: { workspaceId_fingerprint: { workspaceId, fingerprint } } });
  await tx.blockerSource.createMany({ data: [{ workspaceId, blockerId: blocker.id, standupId }], skipDuplicates: true });
  if (inserted.count) {
    const path = `blockers#${blocker.id}`;
    await activity(tx, workspaceId, actorId, "blocker", title, path);
    if (severity === "HIGH") {
      const leads = await tx.membership.findMany({ where: { workspaceId, removedAt: null, role: { in: ["ADMIN","OWNER"] }, userId: { not: actorId } } });
      for (const lead of leads) await notify(tx, workspaceId, lead.userId, `urgent:${blocker.id}`, `High-severity blocker: ${title}`, path);
    }
  }
  return blocker;
}

export async function runCommand(actorId: string, input: Command, now = new Date()) {
  return atomic(async tx => {
    if (input.action === "workspace") {
      const item = await tx.workspace.create({ data: { name: input.name, timezone: input.timezone, members: { create: { userId: actorId, role: "OWNER" } } } });
      return { workspaceId: item.id };
    }
    if (input.action === "join") {
      const item = await tx.invite.findUnique({ where: { digest: hash(input.token) } });
      const user = await tx.user.findUniqueOrThrow({ where: { id: actorId } });
      if (!item || item.usedAt || item.expiresAt <= now || item.email !== user.email.toLowerCase()) {
        throw new AppError(400, "This invitation has expired, was used, or was sent to another email.");
      }
      await tx.invite.update({ where: { id: item.id }, data: { usedAt: now } });
      const where = { workspaceId_userId: { workspaceId: item.workspaceId, userId: actorId } };
      const existing = await tx.membership.findUnique({ where });
      if (!existing || existing.removedAt) {
        await tx.membership.upsert({ where, create: { workspaceId: item.workspaceId, userId: actorId }, update: { removedAt: null, role: "MEMBER", joinedAt: now } });
        await activity(tx, item.workspaceId, actorId, "membership", "joined the workspace", "settings");
      }
      return { workspaceId: item.workspaceId };
    }

    const { workspaceId } = input;
    const actor = await membership(tx, workspaceId, actorId);
    const lead = actor.role !== "MEMBER";
    const today = localTime(now, actor.workspace.timezone).day;
    switch (input.action) {
      case "invite": {
        if (!lead) throw forbidden();
        const token = randomBytes(32).toString("base64url");
        await tx.invite.create({ data: { workspaceId, email: input.email, digest: hash(token), expiresAt: new Date(now.getTime() + 72 * 3600_000) } });
        return { token };
      }
      case "membership": {
        if (actor.role !== "OWNER") throw forbidden();
        const target = await membership(tx, workspaceId, input.userId);
        if (target.role === "OWNER") throw forbidden();
        const where = { workspaceId_userId: { workspaceId, userId: target.userId } };
        if (input.role === "REMOVE") {
          if (await tx.commitment.count({ where: { workspaceId, ownerId: target.userId, status: "OPEN" } })) {
            throw new AppError(409, "Reassign this member’s open commitments before removing them.");
          }
          await tx.blocker.updateMany({ where: { workspaceId, ownerId: target.userId, status: "OPEN" }, data: { ownerId: null, version: { increment: 1 } } });
          await tx.invite.updateMany({ where: { workspaceId, email: (await tx.user.findUniqueOrThrow({ where: { id: target.userId } })).email, usedAt: null }, data: { usedAt: now } });
          await tx.membership.update({ where, data: { removedAt: now } });
        } else {
          await tx.membership.update({ where, data: { role: input.role } });
        }
        return {};
      }
      case "settings": {
        if (!lead) throw forbidden();
        const { name, timezone, weekdays, reminderTime, digestTime, template, aiEnabled } = input;
        await tx.workspace.update({ where: { id: workspaceId }, data: { name, timezone, weekdays: [...new Set(weekdays)].sort(), reminderTime, digestTime, template, aiEnabled } });
        return {};
      }
      case "preferences": {
        await tx.membership.update({ where: { workspaceId_userId: { workspaceId, userId: actorId } }, data: { reminders: input.reminders, emailOptIn: input.emailOptIn } });
        return {};
      }
      case "draft":
      case "standup": {
        if (input.day > today || input.day < shiftDay(today, -90)) throw new AppError(400, "Choose an update date within the previous 90 days.");
        const key = { workspaceId, authorId: actorId, day: input.day };
        const where = { workspaceId_authorId_day: key };
        const current = await tx.standup.findUnique({ where });
        const draft = await tx.draft.findUnique({ where });
        if (input.action === "draft") {
          if (input.standupVersion !== (current?.version ?? 0) || input.version !== (draft?.version ?? 0)) throw conflict();
          const saved = await tx.draft.upsert({ where, create: { ...key, content: input.content }, update: { content: input.content, version: { increment: 1 } } });
          return { version: saved.version };
        }
        if (input.version !== (current?.version ?? 0) || input.draftVersion !== (draft?.version ?? 0)) throw conflict();
        if (input.trackBlocker && !input.content.impediments) throw new AppError(400, "Describe the blocker first.");
        const update = await tx.standup.upsert({ where, create: { ...key, ...input.content }, update: { ...input.content, version: { increment: 1 } } });
        await tx.standupRevision.create({ data: { workspaceId, standupId: update.id, actorId, version: update.version, snapshot: input.content } });
        await tx.draft.deleteMany({ where: key });
        await activity(tx, workspaceId, actorId, "standup", current ? "edited an update" : "posted an update", `activity?update=${update.id}`);
        if (input.trackBlocker) await trackBlocker(tx, workspaceId, actorId, update.id, input.content.impediments.slice(0, 200), "NORMAL");
        if (input.content.decisions && input.content.decisions !== current?.decisions) {
          const leads = await tx.membership.findMany({ where: { workspaceId, removedAt: null, userId: { not: actorId }, role: { in: ["OWNER", "ADMIN"] } } });
          for (const member of leads) {
            await notify(tx, workspaceId, member.userId, `decision:${update.id}:${hash(input.content.decisions)}`, "An update requests a decision or help", `activity?update=${update.id}`);
          }
        }
        return { id: update.id, version: update.version };
      }
      case "blocker": {
        await source(tx, workspaceId, input.sourceId);
        const item = await trackBlocker(tx, workspaceId, actorId, input.sourceId, input.title, input.severity);
        return { id: item.id };
      }
      case "blockerChange": {
        const where = { workspaceId_id: { workspaceId, id: input.id } };
        const item = await tx.blocker.findUnique({ where });
        if (!item) throw missing();
        if (!lead && (item.ownerId !== actorId || input.ownerId !== actorId)) throw forbidden();
        if (item.version !== input.version) throw conflict();
        if (input.ownerId && (input.status === "OPEN" || item.ownerId !== input.ownerId)) await membership(tx, workspaceId, input.ownerId);
        const resolvedAt = input.status === "OPEN" ? null : item.resolvedAt ?? now;
        const updated = await tx.blocker.update({ where, data: { ownerId: input.ownerId, status: input.status, severity: input.severity, resolvedAt, version: { increment: 1 } } });
        if (updated.ownerId && updated.ownerId !== item.ownerId && updated.ownerId !== actorId) {
          await notify(tx, workspaceId, updated.ownerId, `assigned:${item.id}:${updated.version}`, `Blocker assigned to you: ${item.title}`, `blockers#${item.id}`);
        }
        await activity(tx, workspaceId, actorId, "blocker", `${input.status === item.status ? "Updated" : input.status === "RESOLVED" ? "Resolved" : "Reopened"} · ${item.title}`, `blockers#${item.id}`);
        return {};
      }
      case "comment": {
        const item = await tx.blocker.findUnique({ where: { workspaceId_id: { workspaceId, id: input.id } } });
        if (!item) throw missing();
        const comment = await tx.blockerComment.create({ data: { workspaceId, blockerId: item.id, authorId: actorId, body: input.body } });
        if (item.ownerId && item.ownerId !== actorId) await notify(tx, workspaceId, item.ownerId, `comment:${comment.id}`, `New comment on ${item.title}`, `blockers#${item.id}`);
        await activity(tx, workspaceId, actorId, "blocker", `Commented · ${item.title}`, `blockers#${item.id}`);
        return {};
      }
      case "commitment": {
        const update = await source(tx, workspaceId, input.sourceId);
        if (!lead && (input.ownerId !== actorId || update.authorId !== actorId)) throw forbidden();
        await membership(tx, workspaceId, input.ownerId);
        const item = await tx.commitment.create({ data: { workspaceId, sourceId: input.sourceId, ownerId: input.ownerId, description: input.description, dueDay: input.dueDay } });
        await tx.commitmentChange.create({ data: { workspaceId, commitmentId: item.id, actorId, ownerId: item.ownerId, dueDay: item.dueDay, status: item.status } });
        await activity(tx, workspaceId, actorId, "commitment", `Created · ${item.description}`, `commitments#${item.id}`);
        if (item.ownerId !== actorId) await notify(tx, workspaceId, item.ownerId, `commitment:${item.id}:1`, `New commitment: ${item.description}`, `commitments#${item.id}`);
        return { id: item.id };
      }
      case "commitmentChange": {
        const where = { workspaceId_id: { workspaceId, id: input.id } };
        const item = await tx.commitment.findUnique({ where });
        if (!item) throw missing();
        if (!lead && (item.ownerId !== actorId || input.ownerId !== actorId)) throw forbidden();
        if (item.version !== input.version) throw conflict();
        if (input.status === "OPEN" || item.ownerId !== input.ownerId) await membership(tx, workspaceId, input.ownerId);
        const completedAt = input.status === "COMPLETED" ? item.completedAt ?? now : null;
        const updated = await tx.commitment.update({ where, data: { dueDay: input.dueDay, ownerId: input.ownerId, status: input.status, completedAt, version: { increment: 1 } } });
        await tx.commitmentChange.create({ data: { workspaceId, commitmentId: item.id, actorId, ownerId: updated.ownerId, dueDay: updated.dueDay, status: updated.status } });
        await activity(tx, workspaceId, actorId, "commitment", `${updated.status === "COMPLETED" ? "Completed" : "Updated"} · ${item.description}`, `commitments#${item.id}`);
        if (updated.ownerId !== item.ownerId && updated.ownerId !== actorId) await notify(tx, workspaceId, updated.ownerId, `commitment:${item.id}:${updated.version}`, `Commitment assigned to you: ${item.description}`, `commitments#${item.id}`);
        return {};
      }
      case "read": {
        await tx.notification.updateMany({ where: { workspaceId, userId: actorId, readAt: null }, data: { readAt: now } });
        return {};
      }
    }
  });
}
