import { z } from "zod";

export const daySchema = z.iso.date();
const text = (length: number) => z.string().trim().max(length);
const required = (length: number) => text(length).min(1);
const id = z.string().min(1).max(80);
const version = z.number().int().min(0).max(2147483646);
const email = z.email().max(254).transform(value => value.toLowerCase());
const clock = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const timezone = z.string().max(100).refine(value => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return !/^[+-]/.test(value);
  } catch {
    return false;
  }
}, "Enter an IANA time zone, such as America/Chicago.");

export const templates = {
  ENGINEERING: { name: "Engineering standup", done: "What shipped or moved forward?", next: "What will you work on next?" },
  PROJECT: { name: "Project check-in", done: "What did you finish or learn?", next: "What are your next deliverables?" },
} as const;

export const fields = z.object({
  done: text(4000),
  next: text(4000),
  impediments: text(2000),
  decisions: text(2000),
  links: z.array(z.url({ protocol: /^https?$/ }).max(1000)).max(8),
});
export const blankUpdate = { done: "", next: "", impediments: "", decisions: "", links: [] };
export const submitted = fields.refine(data => data.done || data.next, "Add an accomplishment or next priority.");

export const credentialsSchema = z.object({ email, password: z.string().min(12).max(128) });
export const registrationSchema = credentialsSchema.extend({ name: required(80) });
export const workspaceSchema = z.object({ name: required(80), timezone });
export const inviteToken = z.string().regex(/^[\w-]{43}$/);
export const sections = ["today","activity","blockers","commitments","digest","insights","settings","notifications"] as const;
const severity = z.enum(["LOW", "NORMAL", "HIGH"]);
const commitmentStatus = z.enum(["OPEN", "COMPLETED", "CANCELED"]);

export const commandSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("workspace"), ...workspaceSchema.shape }),
  z.object({ action: z.literal("invite"), workspaceId: id, email }),
  z.object({ action: z.literal("join"), token: inviteToken }),
  z.object({ action: z.literal("membership"), workspaceId: id, userId: id, role: z.enum(["ADMIN", "MEMBER", "REMOVE"]) }),
  z.object({ action: z.literal("settings"), workspaceId: id, ...workspaceSchema.shape, weekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7), reminderTime: clock, digestTime: clock, template: z.enum(["ENGINEERING", "PROJECT"]), aiEnabled: z.boolean() }),
  z.object({ action: z.literal("preferences"), workspaceId: id, reminders: z.boolean(), emailOptIn: z.boolean() }),
  z.object({ action: z.literal("draft"), workspaceId: id, day: daySchema, version, standupVersion: version, content: fields }),
  z.object({ action: z.literal("standup"), workspaceId: id, day: daySchema, version, draftVersion: version, content: submitted, trackBlocker: z.boolean() }),
  z.object({ action: z.literal("blocker"), workspaceId: id, sourceId: id, title: required(200), severity }),
  z.object({ action: z.literal("blockerChange"), workspaceId: id, id, version, ownerId: id.nullable(), severity, status: z.enum(["OPEN", "RESOLVED"]) }),
  z.object({ action: z.literal("comment"), workspaceId: id, id, body: required(2500) }),
  z.object({ action: z.literal("commitment"), workspaceId: id, sourceId: id, ownerId: id, description: required(500), dueDay: daySchema }),
  z.object({ action: z.literal("commitmentChange"), workspaceId: id, id, version, status: commitmentStatus, ownerId: id, dueDay: daySchema }),
  z.object({ action: z.literal("read"), workspaceId: id }),
]);

export type Command = z.infer<typeof commandSchema>;
export type UpdateFields = z.infer<typeof fields>;

export function localTime(at: Date, zone: string) {
  const fields = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(at).map(({ type, value }) => [type, value]));
  const day = `${fields.year}-${fields.month}-${fields.day}`;
  return { day, clock: `${fields.hour}:${fields.minute}`, weekday: new Date(day).getUTCDay() };
}

export function shiftDay(day: string, delta: number) {
  const date = new Date(day);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

export function scheduled(at: Date, zone: string, weekdays: number[], time: string) {
  const now = localTime(at, zone);
  // A skipped spring-forward minute runs as soon as the wall clock passes it.
  // A repeated fall-back hour uses the same logical day and idempotency key.
  return weekdays.includes(now.weekday) && now.clock >= time ? now.day : null;
}

export const digestSchema = z.object({
  updates: z.array(z.object({ id, author: z.string(), day: daySchema, done: z.string(), next: z.string(), decisions: z.string(), impediments: z.string() })),
  blockers: z.array(z.object({ id, title: z.string(), sourceIds: z.array(id) })),
  outstanding: z.number().int().nonnegative(),
});

export const intelligenceSchema = z.object({
  observations: z.array(z.object({
    kind: z.enum(["progress", "blocker", "action", "contradiction", "decision"]),
    text: z.string().min(1).max(500),
    sourceIds: z.array(id).min(1).max(8),
  })).max(12),
});

export function log(level: "info" | "warn" | "error", event: string, context: Record<string, unknown>) {
  console[level](JSON.stringify({ level, event, time: new Date().toISOString(), ...context }));
}
