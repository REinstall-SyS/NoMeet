import { digestSchema, intelligenceSchema, shiftDay } from "@nomeet/domain";
import { type Prisma } from "@prisma/client";
import { db } from "./client";
import { membership } from "./commands";

export type Period = "daily" | "weekly";

export async function buildDigest(tx: Prisma.TransactionClient, workspaceId: string, period: Period, day: string) {
  const start = period === "daily" ? day : shiftDay(day, -6);
  const [updates, blockers, outstanding] = await Promise.all([
    tx.standup.findMany({
      where: { workspaceId, day: { gte: start, lte: day } },
      orderBy: [{ day: "asc" }, { authorId: "asc" }],
      include: { author: { select: { user: { select: { name: true } } } } },
    }),
    tx.blocker.findMany({
      where: { workspaceId, status: "OPEN" },
      orderBy: { createdAt: "asc" },
      include: { sources: { select: { standupId: true }, orderBy: { standup: { day: "desc" } }, take: 5 } },
    }),
    tx.commitment.count({ where: { workspaceId, status: "OPEN" } }),
  ]);
  return digestSchema.parse({
    updates: updates.map(({ id, author, day, done, next, impediments, decisions }) => ({ id, author: author.user.name ?? "Teammate", day, done, next, decisions, impediments })),
    blockers: blockers.map(item => ({ id: item.id, title: item.title, sourceIds: item.sources.map(source => source.standupId) })),
    outstanding,
  });
}

export async function getDigest(workspaceId: string, viewer: string, period: Period, day: string) {
  return db.$transaction(async tx => {
    await membership(tx, workspaceId, viewer);
    const saved = await tx.digest.findUnique({ where: { workspaceId_period_day: { workspaceId, period, day } } });
    return {
      createdAt: saved?.createdAt,
      content: saved ? digestSchema.parse(saved.content) : await buildDigest(tx, workspaceId, period, day),
      ai: intelligenceSchema.safeParse(saved?.ai).data,
    };
  });
}
