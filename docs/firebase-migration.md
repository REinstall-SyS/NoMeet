# Firebase migration

The existing site uses Firebase Hosting and one browser bundle with anonymous or custom-token Firebase Auth. Firestore is the system of record. There are no deployed triggers defined by the checked-in Cloud Functions source. The committed Firestore rules stopped granting browser access on 2025-12-13. Confirm the effective deployed rules and data availability with the Firebase project owner before cutover.

Keep the existing Firebase hosting source, configuration, and Git history. Run the Next.js application against a separate PostgreSQL database and preview hostname. New workspaces are private by default. The legacy application stored profiles, daily threads, replies and summary reports in a shared app namespace without a trustworthy workspace membership map.

1. Take encrypted, read-only exports of Firestore and Firebase Auth using a scoped administrator credential. Export each reviewed namespace with the original document paths, timestamps and UID. Confirm who may see the archived material.
2. Normalize the export with an explicit legacy UID-to-new-user mapping. Anonymous UIDs need an operator-approved mapping supported by independent proof of ownership. Display names alone cannot establish identity. Only include consenting users and reviewed data in the target workspace.
3. Dry-run the importer in staging. Map `done` and `doing` to accomplishments and next priorities, and retain free-text blockers with the original update. Do not infer owners or open work from historical text. Keep the complete original export, including historical reports and metadata, in access-controlled archival storage. Record document counts, rejected rows and mapping decisions.
4. Compare dates, authors and counts with the backup, test user access, and reconcile exports made during staging. If verified legacy clients can write, agree on a maintenance window and take a final export. Take a PostgreSQL snapshot, rerun import and confirm parity before changing the entry point.
5. Keep the legacy hosting deployment and encrypted backups available for rollback. Reverting routing sends users back to legacy, while new writes remain in PostgreSQL for reconciliation. Revoke temporary exports and service-account access after the retention window.

Production export, identity reconciliation, Firebase permissions and cutover require the project owner's environment. Do not deploy broader Firestore rules to recover access.

## Normalized import format

From the encrypted legacy export, prepare a UTF-8 JSON file outside Git. The legacy date is the existing document key and remains unchanged. The primary timestamp is the Firestore update timestamp in ISO 8601 UTC. Use the original full document path for each archived reply. Verify the displayed author labels before import.

```json
{
  "workspaceId": "approved-postgres-workspace-id",
  "identity": {"legacy-firebase-uid": "approved-postgres-user-id"},
  "updates": [
    {
      "uid": "legacy-firebase-uid",
      "day": "2025-11-21",
      "timestamp": "2025-11-21T18:30:00Z",
      "done": "Published delivery validation",
      "doing": "Verify retries",
      "blockers": "",
      "replies": [
        {
          "path": "artifacts/default-hackathon-app/public/data/standupArchive/2025-11-21/updates/legacy-firebase-uid/replies/example-id",
          "authorLabel": "Archived teammate",
          "body": "I'll verify the staging logs.",
          "timestamp": "2025-11-21T19:30:00Z"
        }
      ]
    }
  ]
}
```

Run `npm run db:import -- /secure/path/normalized.json` for a rollback-only rehearsal. After comparing counts and workspace access, add `--apply` to commit. Identical rows are safe to replay. The importer rejects collisions with different target content and rows whose mapped authors are outside the selected workspace. Large exports can be normalized into non-overlapping batches.
