import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";

async function register(page: Page, name: string, email: string, url = "/workspaces") {
  await page.goto(url);
  await page.getByRole("button", { name: "Create a local account" }).click();
  await page.getByLabel("Name", { exact: true }).fill(name);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill("no-meet-test-password");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
}

test("team members join, publish, resolve a blocker and complete a commitment", async ({ page, browser }, info) => {
  const tag = randomUUID().slice(0, 8);
  await register(page, "Avery Lead", `avery-${tag}@example.test`);
  await expect(page.getByRole("heading", { name: "Your workspaces" })).toBeVisible();
  await page.getByLabel("Workspace name").fill(`Lake Engineering ${tag}`);
  await page.getByRole("button", { name: "Create workspace" }).click();
  await expect(page.getByRole("heading", { name: "Today", exact: true })).toBeVisible();
  const base = new URL(page.url()).pathname.replace(/\/today$/, "");

  await page.getByRole("link", { name: "Settings", exact: true }).click();
  const invitee = `blake-${tag}@example.test`;
  await page.getByLabel("Invite a teammate").fill(invitee);
  await page.getByRole("button", { name: "Create invite link" }).click();
  const dialog = page.getByRole("dialog", { name: "Invitation ready" });
  await expect(dialog).toBeVisible();
  const invite = await dialog.getByLabel("Invite link").inputValue();
  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(dialog).toHaveCount(0);

  const context = await browser.newContext({ baseURL: String(info.project.use.baseURL) });
  const member = await context.newPage();
  try {
    await register(member, "Blake Dev", invitee, invite);
    await expect(member.getByRole("heading", { name: "Join your team" })).toBeVisible();
    await member.getByRole("button", { name: "Accept invitation" }).click();
    await expect(member.getByRole("heading", { name: "Today", exact: true })).toBeVisible();

    await page.goto(`${base}/today`);
    await page.getByLabel("Accomplishments").fill("Merged the job metrics");
    await page.getByRole("button", { name: "Publish update" }).click();
    await expect(page.getByRole("heading", { name: "Published update" })).toBeVisible();
    await page.getByText("Create a commitment from this update", { exact: true }).click();
    await page.getByLabel("Description").fill("Validate the retry dashboard");
    await page.getByRole("button", { name: "Create commitment", exact: true }).click();
    await expect(page.getByRole("link", { name: "Validate the retry dashboard" })).toBeVisible();

    await member.getByLabel("Next priorities").fill("Test webhook retries");
    await expect(member.getByRole("status").filter({ hasText: "Draft saved" })).toBeVisible();
    await member.reload();
    await expect(member.getByLabel("Next priorities")).toHaveValue("Test webhook retries");
    await member.getByLabel("Blockers", { exact: true }).fill("Staging webhook key is missing");
    await member.getByLabel("Track this blocker on the board").check();
    await member.getByRole("button", { name: "Publish update" }).click();
    await expect(member.getByRole("heading", { name: "Published update" })).toBeVisible();

    await page.getByRole("link", { name: "Blocker board", exact: true }).click();
    const blocker = page.getByRole("article").filter({ hasText: "Staging webhook key is missing" });
    await blocker.getByText("Manage blocker", { exact: true }).click();
    await blocker.getByLabel("Owner").selectOption({ label: "Blake Dev" });
    await blocker.getByRole("button", { name: "Save blocker" }).click();
    await expect(blocker.getByRole("paragraph").filter({ hasText: /^Blake Dev$/ })).toBeVisible();

    await member.getByRole("link", { name: "Blocker board", exact: true }).click();
    const assigned = member.getByRole("article").filter({ hasText: "Staging webhook key is missing" });
    await assigned.getByText("Add comment", { exact: true }).click();
    await assigned.getByLabel("Comment").fill("The staging credentials were rotated.");
    await assigned.getByRole("button", { name: "Post comment" }).click();
    await expect(assigned.getByText("Discussion (1)")).toBeVisible();
    await assigned.getByText("Manage blocker", { exact: true }).click();
    await assigned.getByLabel("Status").selectOption("RESOLVED");
    await assigned.getByRole("button", { name: "Save blocker" }).click();
    await expect(member.locator("section").filter({ has: member.getByRole("heading", { name: "Resolved", exact: true }) }).getByRole("heading", { name: "Staging webhook key is missing" })).toBeVisible();

    await page.goto(`${base}/today`);
    await page.getByRole("button", { name: "Mark complete" }).click();
    await expect(page.getByRole("link", { name: "Validate the retry dashboard" })).toHaveCount(0);
    await page.getByRole("link", { name: "Commitments", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Completed", exact: true })).toBeVisible();

    await page.getByRole("link", { name: "Digests", exact: true }).click();
    await expect(page.getByText("Test webhook retries", { exact: false })).toBeVisible();
    await member.goto("/w/demo-harbor/today");
    await expect(member.getByRole("heading", { name: "Page unavailable" })).toBeVisible();
  } finally { await context.close(); }
});

test("seeded workspace screens", async ({ page }) => {
  await page.goto("/signin");
  await page.getByLabel("Email", { exact: true }).fill("maya@demo.nomeet.test");
  await page.getByLabel("Password", { exact: true }).fill("harbor-demo-2026");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your workspaces" })).toBeVisible();
  await page.getByRole("link", { name: /Harbor Delivery/ }).click();
  await expect(page.getByText("Record the rollout threshold in the runbook")).toBeVisible();
  if (process.env.CAPTURE_SCREENSHOTS === "1") {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({ path: "docs/screenshots/today.png", fullPage: true });
  }
  await page.getByRole("link", { name: "Blocker board", exact: true }).click();
  await expect(page.getByText("Carrier sandbox access intermittently returns 403")).toBeVisible();
  if (process.env.CAPTURE_SCREENSHOTS === "1") await page.screenshot({ path: "docs/screenshots/blockers.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("link", { name: "Team insights", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Team insights" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
