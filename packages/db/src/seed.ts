import { db } from "./client";
import { buildDigest } from "./digest";
import { localTime, shiftDay, type UpdateFields } from "@nomeet/domain";
import { randomBytes, scryptSync } from "node:crypto";

const workspaceId = "demo-harbor";
const team = [
  { name: "Maya Chen", email: "maya@demo.nomeet.test", zone: "America/Chicago", role: "OWNER" },
  { name: "Jon Bell", email: "jon@demo.nomeet.test", zone: "America/Chicago", role: "MEMBER" },
  { name: "Camille Laurent", email: "camille@demo.nomeet.test", zone: "Europe/Paris", role: "ADMIN" },
  { name: "Noah Martin", email: "noah@demo.nomeet.test", zone: "Europe/Paris", role: "MEMBER" },
] as const;

const milestones = [
  ["Agreed on the delivery-event contract", "Selected sample receipts for testing", "Mapped carrier response codes", "Documented stale tracking states"],
  ["Added webhook event validation", "Created receipt fixtures", "Implemented the carrier adapter", "Built the tracking history layout"],
  ["Added delivery retry policy", "Ran webhook replay in staging", "Mapped carrier timeouts to retries", "Added empty and delayed states"],
  ["Reviewed retry metrics", "Verified retry timing on ten fixtures", "Reproduced sandbox authorization failures", "Connected history to the tracking endpoint"],
  ["Added correlation IDs for delivery events", "Tested a batch of duplicate events", "Confirmed the sandbox issue with carrier support", "Fixed links from the tracking history"],
  ["Reviewed rollout criteria", "Ran the acceptance checklist", "Wrote a staging credential rotation guide", "Verified the tracking screen with assistive technology"],
  ["Signed off on the staging pilot", "Validated recent delivery events", "Retested the carrier adapter after rotation", "Captured feedback from the pilot team"],
];

function morning(day: string, zone: string) {
  const at = new Date(`${day}T09:00:00Z`);
  const [hour, minute] = localTime(at, zone).clock.split(":").map(Number);
  return new Date(at.getTime() + (540 - 60 * hour - minute) * 60_000);
}

try {
  if (process.env.ENABLE_LOCAL_AUTH !== "true" || process.env.NODE_ENV === "production") throw new Error("The demo seed requires local authentication in development.");
  const today = localTime(new Date(), "America/Chicago").day;
  const salt = randomBytes(16).toString("hex");
  const passwordHash = `${salt}:${scryptSync("harbor-demo-2026", salt, 64).toString("hex")}`;
  const created = await db.$transaction(async tx => {
    if (await tx.workspace.findUnique({ where: { id: workspaceId } })) return false;
    const firstDay = shiftDay(today, -9);
    const people = await Promise.all(team.map(person => tx.user.create({ data: { name: person.name, email: person.email, passwordHash } })));
    await tx.workspace.create({
      data: {
        id: workspaceId, name: "Harbor Delivery · Demo", timezone: "America/Chicago",
        createdAt: morning(firstDay, "America/Chicago"),
        members: { create: people.map((person, i) => ({ userId: person.id, role: team[i].role, joinedAt: morning(firstDay, team[i].zone) })) },
      },
    });
    const days = [-9, -8, -7, -6, -4, -2, -1].map(i => shiftDay(today, i));
    const updates: string[][] = [];
    for (const [i, day] of days.entries()) {
      updates.push([]);
      for (const [p, person] of team.entries()) {
        const createdAt = morning(day, person.zone);
        const content: UpdateFields = {
          done: milestones[i][p],
          next: milestones[i + 1]?.[p] ?? ["Monitor pilot logs for duplicates", "Prepare the next acceptance pass", "Verify the production credential scope", "Review pilot feedback with Maya"][p],
          impediments: i >= 3 && p === 2 && i < 6 ? "Carrier sandbox access intermittently returns 403" : "",
          decisions: i === 5 && p === 0 ? "Can we keep the pilot at 10 percent for two business days?" : "",
          links: [],
        };
        const row = await tx.standup.create({
          data: {
            workspaceId, authorId: people[p].id, day, ...content, createdAt, updatedAt: createdAt,
            revisions: { create: { actorId: people[p].id, version: 1, snapshot: content, createdAt } },
          },
        });
        updates[i].push(row.id);
        await tx.activity.create({ data: { workspaceId, actorId: people[p].id, kind: "standup", label: "posted an update", path: `activity?update=${row.id}`, createdAt } });
      }
    }

    const open = await tx.blocker.create({ data: {
      workspaceId, title: "Confirm pilot rollout threshold", fingerprint: "demo-pilot-threshold", severity: "NORMAL", ownerId: people[0].id,
      createdAt: morning(days[5], team[0].zone), sources: { create: { standupId: updates[5][0] } },
      comments: { create: { authorId: people[1].id, body: "The sample size covers retries, but we should wait for at least one business day of real deliveries." } },
    } });
    const resolved = await tx.blocker.create({ data: {
      workspaceId, title: "Carrier sandbox access intermittently returns 403", fingerprint: "demo-carrier-sandbox", severity: "HIGH", status: "RESOLVED", ownerId: people[2].id,
      createdAt: morning(days[3], team[2].zone), resolvedAt: morning(days[6], team[2].zone),
      sources: { create: [3, 4, 5].map(i => ({ standupId: updates[i][2] })) },
    } });
    const first = await tx.commitment.create({ data: {
      workspaceId, sourceId: updates[5][0], ownerId: people[0].id,
      description: "Record the rollout threshold in the runbook", dueDay: days[6], createdAt: morning(days[5], team[0].zone),
      history: { create: { actorId: people[0].id, ownerId: people[0].id, status: "OPEN", dueDay: days[6], createdAt: morning(days[5], team[0].zone) } },
    } });
    await tx.commitment.create({ data: {
      workspaceId, sourceId: updates[3][2], ownerId: people[2].id, status: "COMPLETED",
      description: "Rotate the staging carrier credential", dueDay: days[6], createdAt: morning(days[3], team[2].zone), completedAt: morning(days[6], team[2].zone),
      history: { create: [
        { actorId: people[2].id, ownerId: people[2].id, status: "OPEN", dueDay: days[6], createdAt: morning(days[3], team[2].zone) },
        { actorId: people[2].id, ownerId: people[2].id, status: "COMPLETED", dueDay: days[6], createdAt: morning(days[6], team[2].zone) },
      ] },
    } });
    const last = days[6];
    const at = morning(last, team[0].zone);
    await tx.activity.createMany({ data: [
      { workspaceId, actorId: people[0].id, kind: "blocker", label: open.title, path: `blockers#${open.id}`, createdAt: morning(days[5], team[0].zone) },
      { workspaceId, actorId: people[2].id, kind: "blocker", label: `Resolved · ${resolved.title}`, path: `blockers#${resolved.id}`, createdAt: at },
      { workspaceId, actorId: people[0].id, kind: "commitment", label: first.description, path: `commitments#${first.id}`, createdAt: morning(days[5], team[0].zone) },
    ] });
    for (const period of ["daily", "weekly"] as const) {
      await tx.digest.create({ data: { workspaceId, period, day: last, content: await buildDigest(tx, workspaceId, period, last), createdAt: at } });
    }
    await tx.notification.create({ data: { workspaceId, userId: people[0].id, key: "demo-digest", title: "Weekly digest is ready", path: `digest?period=weekly&day=${last}`, createdAt: at } });
    return true;
  }, { timeout: 30000 });
  console.log(created ? "Seeded Harbor Delivery · Demo" : "Harbor Delivery · Demo already exists");
  console.log("Development sign-in: maya@demo.nomeet.test / harbor-demo-2026");
} finally { await db.$disconnect(); }
