import { describe, expect, it } from "vitest";
import { commandSchema, localTime, scheduled } from "@nomeet/domain";

describe("workspace scheduling", () => {
  it("uses the workspace local day and time", () => {
    const instant = new Date("2026-11-17T09:10:00Z");
    expect(scheduled(instant, "Europe/Paris", [2], "10:00")).toBe("2026-11-17");
    expect(scheduled(instant, "America/Chicago", [2], "10:00")).toBeNull();
    expect(localTime(new Date("2026-11-17T01:00:00Z"), "America/Chicago").day).toBe("2026-11-16");
  });

  it("runs after a skipped spring-forward time and keeps a single fall-back logical date", () => {
    expect(scheduled(new Date("2026-03-08T07:59:00Z"), "America/Chicago", [0], "02:30")).toBeNull();
    expect(scheduled(new Date("2026-03-08T08:00:00Z"), "America/Chicago", [0], "02:30")).toBe("2026-03-08");
    const first = scheduled(new Date("2026-11-01T06:45:00Z"), "America/Chicago", [0], "01:30");
    const second = scheduled(new Date("2026-11-01T07:45:00Z"), "America/Chicago", [0], "01:30");
    expect(first).toBe("2026-11-01");
    expect(second).toBe(first);
  });

  it("rejects invalid dates, time zones, incomplete updates, and unsafe link protocols", () => {
    expect(commandSchema.safeParse({ action: "workspace", name: "Skyline", timezone: "+05:00" }).success).toBe(false);
    const input = { action: "standup", workspaceId: "team", version: 0, draftVersion: 0, day: "2026-02-28", trackBlocker: false };
    const content = { done: "release", next: "", impediments: "", decisions: "", links: ["https://example.com"] };
    expect(commandSchema.safeParse({ ...input, day: "2026-02-30", content }).success).toBe(false);
    expect(commandSchema.safeParse({ ...input, content: { ...content, done: "" } }).success).toBe(false);
    expect(commandSchema.safeParse({ ...input, content: { ...content, links: ["javascript:void(0)"] } }).success).toBe(false);
    expect(commandSchema.safeParse({ ...input, content }).success).toBe(true);
  });
});
