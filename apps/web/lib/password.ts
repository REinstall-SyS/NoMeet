import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const derive = promisify(scrypt);

export async function passwordHash(password: string) {
  const salt = randomBytes(16).toString("hex");
  const key = await derive(password, salt, 64) as Buffer;
  return `${salt}:${key.toString("hex")}`;
}

export async function matchesPassword(password: string, encoded?: string | null) {
  const [salt, hash] = encoded?.split(":") ?? [];
  const key = await derive(password, salt ?? "no-account", 64) as Buffer;
  return !!hash && timingSafeEqual(key, Buffer.from(hash, "hex"));
}
