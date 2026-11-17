import { readFile } from "node:fs/promises";
import { daySchema, fields } from "@nomeet/domain";
import { z } from "zod";
import { db } from "./client";

const configSchema = z.object({
  workspaceId: z.string().min(1),
  identity: z.record(z.string(), z.string().min(1)),
  updates: z.array(z.object({
    uid: z.string().min(1), day: daySchema, timestamp: z.iso.datetime(),
    done: z.string(), doing: z.string(), blockers: z.string(),
    replies: z.array(z.object({ path: z.string().min(1).max(1000), authorLabel: z.string().min(1).max(100), body: z.string().min(1).max(10000), timestamp: z.iso.datetime() })).default([]),
  })),
});

const [path, mode] = process.argv.slice(2);
if (!path || (mode !== undefined && mode !== "--apply") || process.argv.length > 4) {
  throw new Error("Usage: npm run db:import -- /path/to/normalized.json [--apply]");
}
const data = configSchema.parse(JSON.parse(await readFile(path, "utf8")));
const dry = mode !== "--apply";
const rollback = new Error("Dry run");
const counts = { matched: 0, inserted: 0, newReplies: 0 };
try {
  await db.$transaction(async tx => {
    const people = new Set((await tx.membership.findMany({ where: { workspaceId: data.workspaceId, removedAt: null }, select: { userId: true } })).map(person => person.userId));
    if (!people.size) throw new Error("The target workspace must already have approved members.");
    const seen = new Set<string>();
    for (const [index, row] of data.updates.entries()) {
      const authorId = Object.hasOwn(data.identity, row.uid) ? data.identity[row.uid] : "";
      if (!people.has(authorId)) throw new Error(`Row ${index + 1}: UID is missing an approved workspace member.`);
      const unique = `${authorId}:${row.day}`;
      if (seen.has(unique)) throw new Error(`Row ${index + 1}: multiple source records map to one member-day.`);
      seen.add(unique);
      const workspaceId = data.workspaceId;
      const key = { workspaceId, authorId, day: row.day };
      const content = fields.parse({ done: row.done, next: row.doing, impediments: row.blockers, decisions: "", links: [] });
      let item = await tx.standup.findUnique({ where: { workspaceId_authorId_day: key } });
      if (item) {
        if (JSON.stringify(fields.parse(item)) !== JSON.stringify(content) || item.createdAt.toISOString() !== new Date(row.timestamp).toISOString()) {
          throw new Error(`Row ${index + 1}: target already contains a different update.`);
        }
        counts.matched++;
      } else {
        const createdAt = new Date(row.timestamp);
        item = await tx.standup.create({ data: {
          ...key, ...content, createdAt, updatedAt: createdAt,
          revisions: { create: { version: 1, actorId: authorId, snapshot: content, createdAt } },
        } });
        await tx.activity.create({ data: { workspaceId, actorId: authorId, kind: "standup", label: "imported a legacy update", path: `activity?update=${item.id}`, createdAt } });
        counts.inserted++;
      }
      for (const reply of row.replies) {
        const createdAt = new Date(reply.timestamp);
        const existing = await tx.legacyReply.findUnique({ where: { path: reply.path } });
        if (existing) {
          if (existing.workspaceId !== workspaceId || existing.sourceId !== item.id || existing.body !== reply.body || existing.authorLabel !== reply.authorLabel || existing.createdAt.getTime() !== createdAt.getTime()) {
            throw new Error(`Row ${index + 1}: reply path conflicts with an existing archive record.`);
          }
        } else {
          await tx.legacyReply.create({ data: { workspaceId, sourceId: item.id, path: reply.path, authorLabel: reply.authorLabel, body: reply.body, createdAt } });
          counts.newReplies++;
        }
      }
    }
    if (dry) throw rollback;
  }, { isolationLevel: "Serializable", timeout: 120000 });
} catch (error) {
  if (error !== rollback) throw error;
} finally { await db.$disconnect(); }
console.log(JSON.stringify({ mode: dry ? "dry-run (rolled back)" : "applied", ...counts }));
