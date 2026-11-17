# Deploy NoMeet

Deploy the web application and worker as two long-lived Node.js processes from the same commit. Use managed PostgreSQL and Redis, a configured SMTP relay, and a TLS endpoint for the web process. Keep database and Redis endpoints private. Configure Redis with persistence and a no-eviction policy suitable for BullMQ.

1. Create separate preview and production databases, Redis instances or queue names, and public application origins. Start in preview. Finish the Firebase data and identity review before promoting the new entry point.
2. Configure secrets in the hosting environment based on `.env.example`. Set `APP_URL` and `AUTH_URL` to the same HTTPS origin and generate a strong `AUTH_SECRET`. Disable `ENABLE_LOCAL_AUTH`. Register `https://your-host/api/auth/callback/google` as an authorized redirect URI for the Google OAuth client, then set `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET`.
3. On the release image run `npm ci` and `npm run build`. Preserve the Prisma-generated client. Take a PostgreSQL snapshot before running `npm run db:migrate` once as a release job. Give the migration identity schema-change privileges and restrict web and worker identities to application reads and writes.
4. Start the web process with `npm start` and the worker with `npm run worker`. Use the port provided by your hosting platform for the web process. Configure readiness against `GET /api/health`. Allow HTTP response streaming and disable proxy buffering for `/api/events`.
5. Configure a TLS-enabled relay through `SMTP_URL` and set `MAIL_FROM`, then test a real opted-in notification in preview. Configure `GEMINI_API_KEY` and `GEMINI_MODEL` only for environments approved for external processing. Optional token prices drive cost estimates in worker logs.
6. Verify OAuth sign-in, invite acceptance, draft recovery, an assignment notification, digest source links, and clean access denial across tenants. Run `npm run jobs` to verify queue and mail state. Review backups, restores, and Firebase reconciliation before routing users to the new application.

## Operations

- Use `npm run jobs` to list BullMQ counts and recent failed job IDs alongside mail states. Alert on persistent failures and absence of scheduler activity, and correlate logs by job ID.
- BullMQ retries transient failures with exponential backoff. The worker records terminal SMTP failure in `Notification.mailState`. After resolving the cause, retry only the affected job. For email, reset its state to `PENDING` and retry the existing failed BullMQ job before allowing the planner to requeue it. Check provider records if delivery status is uncertain.
- Keep completed jobs long enough to cover the current logical day. PostgreSQL keys protect against repeat digest and in-app delivery even after Redis retention expires. A downtime interval that spans an entire eligible local date requires an operator review before replay.
- Keep Redis access private. A job payload is an internal command and has no end-user credentials. The worker checks that the referenced workspace still exists before publishing.
- To roll back application code, redeploy the previous package version if it is compatible with the current schema. For migration cutover rollback, follow the [Firebase plan](firebase-migration.md) so PostgreSQL writes can be reconciled.
