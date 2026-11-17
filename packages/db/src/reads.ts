import { type Prisma } from "@prisma/client";
import { daySchema, fields, localTime, shiftDay } from "@nomeet/domain";
import { z } from "zod";
import { AppError, db } from "./client";
import { membership } from "./commands";

const person = { select: { user: { select: { name: true } } } } as const;
const activityCursor = z.object({ at: z.iso.datetime(), id: z.string().min(1).max(80) });

export async function workspaces(userId: string) {
  return db.membership.findMany({ where: { userId, removedAt: null }, include: { workspace: true }, orderBy: { joinedAt: "asc" } });
}

export async function getWorkspace(workspaceId: string, userId: string) {
  return membership(db, workspaceId, userId);
}

export async function getPeople(workspaceId: string, viewer: string) {
  return db.$transaction(async tx => {
    await membership(tx, workspaceId, viewer);
    return tx.membership.findMany({ where: { workspaceId, removedAt: null }, select: { userId: true, role: true, ...person.select }, orderBy: { joinedAt: "asc" } });
  });
}

export async function getToday(workspaceId: string, viewer: string, requestedDay?: string) {
  return db.$transaction(async tx => {
    const member = await membership(tx, workspaceId, viewer);
    const today = localTime(new Date(), member.workspace.timezone).day;
    const day = daySchema.safeParse(requestedDay).data ?? today;
    const where = { workspaceId_authorId_day: { workspaceId, authorId: viewer, day } };
    const [update, draft, roster, checkedIn, outstanding] = await Promise.all([
      tx.standup.findUnique({ where, include: { revisions: { orderBy: { version: "desc" }, take: 10 } } }),
      tx.draft.findUnique({ where }),
      tx.membership.findMany({ where: { workspaceId, removedAt: null }, select: { userId: true, ...person.select }, orderBy: { joinedAt: "asc" } }),
      tx.standup.findMany({ where: { workspaceId, day }, select: { authorId: true, id: true } }),
      tx.commitment.findMany({ where: { workspaceId, ownerId: viewer, status: "OPEN", OR: [{ dueDay: { lte: day } }, { source: { day: { lt: day } } }] }, orderBy: { dueDay: "asc" }, take: 50 }),
    ]);
    return { day, today, update, draft: fields.safeParse(draft?.content).data, draftVersion: draft?.version ?? 0, roster, checkedIn, outstanding };
  });
}

export async function getActivity(workspaceId: string, viewer: string, cursor?: string, query?: string) {
  const search = query?.trim().slice(0, 100) ?? "";
  let boundary: z.infer<typeof activityCursor> | undefined;
  if (cursor) {
    try {
      if (cursor.length > 300) throw new Error();
      boundary = activityCursor.parse(JSON.parse(Buffer.from(cursor, "base64url").toString()));
    } catch {
      throw new AppError(400, "That activity page is no longer available.");
    }
  }
  return db.$transaction(async tx => {
    await membership(tx, workspaceId, viewer);
    const filters: Prisma.ActivityWhereInput[] = [];
    if (boundary) filters.push({ OR: [{ createdAt: { lt: new Date(boundary.at) } }, { createdAt: new Date(boundary.at), id: { lt: boundary.id } }] });
    if (search) {
      const contains = { contains: search, mode: "insensitive" as const };
      const matches = await tx.standup.findMany({
        where: { workspaceId, OR: [{ done: contains }, { next: contains }, { decisions: contains }, { impediments: contains }] },
        orderBy: [{ day: "desc" }, { id: "desc" }],
        take: 250,
        select: { id: true },
      });
      filters.push({ OR: [{ label: contains }, { actor: { user: { name: contains } } }, { path: { in: matches.map(item => `activity?update=${item.id}`) } }] });
    }
    const rows = await tx.activity.findMany({ where: { workspaceId, AND: filters }, include: { actor: person }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 26 });
    const items = rows.slice(0, 25);
    const last = items.at(-1);
    const next = rows.length > 25 && last ? Buffer.from(JSON.stringify({ at: last.createdAt, id: last.id })).toString("base64url") : undefined;
    return { items, next };
  });
}

export async function getUpdate(workspaceId: string, viewer: string, id: string) {
  return db.$transaction(async tx => {
    await membership(tx, workspaceId, viewer);
    const update = await tx.standup.findUnique({
      where: { workspaceId_id: { workspaceId, id } },
      include: { author: person, legacyReplies: { orderBy: { createdAt: "asc" } } },
    });
    if (!update) throw new AppError(404, "That item could not be found.");
    return update;
  });
}

export async function getBlockers(workspaceId: string, viewer: string, status: "OPEN" | "RESOLVED", cursor?: string) {
  return db.$transaction(async tx => {
    await membership(tx, workspaceId, viewer);
    const boundary = cursor ? await tx.blocker.findUnique({ where: { workspaceId_id: { workspaceId, id: cursor }, status } }) : undefined;
    const items = await tx.blocker.findMany({
      where: { workspaceId, status, ...(boundary ? { OR: [{ createdAt: { lt: boundary.createdAt } }, { createdAt: boundary.createdAt, id: { lt: boundary.id } }] } : {}) },
      include: { owner: person, sources: { select: { standupId: true, standup: { select: { day: true } } }, orderBy: { standup: { day: "desc" } }, take: 20 }, comments: { orderBy: { createdAt: "desc" }, take: 30, include: { author: person } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 31,
    });
    return { items: items.slice(0, 30), next: items.length > 30 ? items[29].id : undefined };
  });
}

export async function getCommitments(workspaceId: string, viewer: string, view: "OPEN" | "COMPLETED" | "CANCELED", cursor?: string) {
  return db.$transaction(async tx => {
    await membership(tx, workspaceId, viewer);
    const boundary = cursor ? await tx.commitment.findUnique({ where: { workspaceId_id: { workspaceId, id: cursor }, status: view } }) : undefined;
    const items = await tx.commitment.findMany({
      where: { workspaceId, status: view, ...(boundary ? { OR: [{ dueDay: { gt: boundary.dueDay } }, { dueDay: boundary.dueDay, id: { gt: boundary.id } }] } : {}) },
      include: { owner: person, history: { orderBy: { createdAt: "desc" }, take: 20, include: { actor: person } } },
      orderBy: [{ dueDay: "asc" }, { id: "asc" }],
      take: 31,
    });
    return { items: items.slice(0, 30), next: items.length > 30 ? items[29].id : undefined };
  });
}

export async function getNotifications(workspaceId: string, viewer: string) {
  return db.$transaction(async tx => {
    await membership(tx, workspaceId, viewer);
    return tx.notification.findMany({ where: { workspaceId, userId: viewer }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 50 });
  });
}

export async function getInsights(workspaceId: string, viewer: string) {
  return db.$transaction(async tx => {
    const member = await membership(tx, workspaceId, viewer);
    const today = localTime(new Date(), member.workspace.timezone).day;
    const since = shiftDay(today, -6);
    const [members, updates, outstanding, overdue, resolved] = await Promise.all([
      tx.membership.findMany({ where: { workspaceId }, select: { userId: true, joinedAt: true, removedAt: true } }),
      tx.standup.findMany({ where: { workspaceId, day: { gte: since, lte: today } }, select: { day: true, authorId: true } }),
      tx.commitment.count({ where: { workspaceId, status: "OPEN" } }),
      tx.commitment.count({ where: { workspaceId, status: "OPEN", dueDay: { lt: today } } }),
      tx.blocker.findMany({ where: { workspaceId, status: "RESOLVED" }, select: { resolvedAt: true, createdAt: true } }),
    ]);
    const days = Array.from({ length: 7 }, (_, i) => {
      const day = shiftDay(since, i);
      const eligible = new Set(members.filter(item => localTime(item.joinedAt, member.workspace.timezone).day <= day
        && (!item.removedAt || localTime(item.removedAt, member.workspace.timezone).day > day)).map(item => item.userId));
      return { day, actual: updates.filter(item => item.day === day && eligible.has(item.authorId)).length, expected: eligible.size,
        scheduled: member.workspace.weekdays.includes(new Date(day).getUTCDay()) };
    });
    const scheduled = days.filter(day => day.scheduled);
    const expected = scheduled.reduce((total, day) => total + day.expected, 0);
    const completion = expected ? Math.round(100 * scheduled.reduce((total, day) => total + day.actual, 0) / expected) : null;
    const averageHours = resolved.length ? resolved.reduce((total, item) => total + ((item.resolvedAt?.getTime() ?? item.createdAt.getTime()) - item.createdAt.getTime()), 0) / resolved.length / 3600_000 : null;
    return { days, completion, outstanding, overdue, averageHours };
  });
}
