# NoMeet

NoMeet gives small software teams, student project groups, and distributed teams a shared record of progress without requiring everyone to attend another status meeting. Teammates can see what shipped, what needs help, and who owns follow-up.

## Main workflows

1. Create a workspace, set its time zone and standup schedule, and share an expiring invite link with each teammate.
2. Publish a structured standup with accomplishments, next priorities, blockers, decision requests, and relevant links. Drafts autosave, and published edits retain a revision history.
3. Turn a reported blocker into a board item. Assign it to a teammate, discuss it, and resolve or reopen it. Matching blocker titles link to an existing item.
4. Track a commitment from its source update. The owner sees open work from previous days and can mark it complete from the next check-in.
5. Review check-in participation, team activity, and source-linked daily and weekly digests. Leads receive digest and decision notifications. Gemini observations are optional.

## Run locally

Use Node.js 22.12 or later, npm, and Docker Compose. You can use existing PostgreSQL, Redis, and SMTP instances by changing the corresponding URLs. Windows PowerShell users can replace `cp` with `Copy-Item`.

```sh
cp .env.example .env
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
docker compose up -d --wait
npm ci
npm run db:migrate
npm run db:seed
npm run dev
```

Paste the generated value into `AUTH_SECRET` in `.env` before starting the web app. Open [NoMeet](http://127.0.0.1:3000). Start `npm run worker` in a second terminal to process scheduled jobs and opted-in email. Open [Mailpit](http://127.0.0.1:8025) to inspect local delivery.

With `ENABLE_LOCAL_AUTH=true`, development users can create password accounts on the sign-in screen. This provider is disabled in production. The optional seed creates **Harbor Delivery · Demo**, a four-person team in Chicago and Paris with 28 updates across a ten-day span, blockers, commitments, and saved digests. Use `maya@demo.nomeet.test` and the development-only demo password `harbor-demo-2026`. For the saved weekly digest, open Notifications and select **Weekly digest is ready**.

## Architecture and deployment

| Package | Responsibility |
| --- | --- |
| `apps/web` | Next.js App Router, Auth.js, server-rendered views, typed commands, notification badge via SSE |
| `apps/worker` | BullMQ schedules, notification outbox delivery, deterministic and optional Gemini digests |
| `packages/db` | Prisma schema, migrations, tenant-scoped access, transactions, demo seed and legacy import |
| `packages/domain` | Zod schemas, standup templates, time-zone scheduling and structured logging |

[Architecture and security decisions](docs/architecture.md) · [Deployment guide](docs/deployment.md) · [Firebase migration plan and import format](docs/firebase-migration.md)

The legacy Firebase application remains in `public/` and `functions/`. The replacement uses its own PostgreSQL database and runtime. The import workflow requires explicit membership and identity mapping.

## Tests

Run database tests against a disposable local database. They create randomized fixtures. Run the demo seed before browser tests.

```sh
npm run typecheck
npm test
RUN_DB_TESTS=1 RUN_REDIS_TESTS=1 npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

In PowerShell set `$env:RUN_DB_TESTS='1'` and `$env:RUN_REDIS_TESTS='1'` separately. The browser test starts the development server if it is unavailable. Set `PLAYWRIGHT_CHANNEL=msedge` to use an installed Microsoft Edge. CI is configured to run database integrations and browser tests on pull requests.

## Current limits and future development

- Reminders follow each workspace’s time zone. The worker can catch up within the same local day after downtime. Catch-up for missed days is manual.
- Decision requests live in updates and digests. A separate decision history with approvals is future work.
- There is no full-text search index. Activity search includes the 250 most recent matching updates, and discussion and revision previews have display limits.
- Local drafts save after a short pause while the editor is open. A competing edit is rejected, and the user can copy their text before reloading.
- The first migration requires an operator-reviewed export. Historical Firebase summaries and metadata remain in the protected archive. A self-service import and identity transfer would require a verified ownership flow.
- SMTP offers at-least-once delivery across ambiguous failures. Add provider-side deduplication if exactly-once external delivery is required.

## Screenshots

[Today](docs/screenshots/today.png) · [Blocker board](docs/screenshots/blockers.png)
