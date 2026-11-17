import { PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";

const singleton = globalThis as typeof globalThis & { nomeetDb?: PrismaClient };
export const db = singleton.nomeetDb ??= new PrismaClient();

export const hash = (value: string) => createHash("sha256").update(value).digest("hex");

export class AppError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function rateLimit(key: string, max: number, minutes: number, at = Date.now()) {
  const interval = minutes * 60_000;
  const window = new Date(Math.floor(at / interval) * interval);
  const result = await db.rateBucket.upsert({
    where: { key_window: { key: hash(key), window } },
    create: { key: hash(key), window },
    update: { count: { increment: 1 } },
  });
  return result.count <= max;
}
