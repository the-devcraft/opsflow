# Deployment and operations

## Process and data prerequisites

- Node.js 24; the production entrypoint is `node dist/server/index.js`.
- A MongoDB replica set. A standalone `mongod` is rejected at startup because atomic domain/audit/outbox writes require transactions.
- `MONGODB_URI`, `APP_ORIGIN`, and optional `PORT` (default 4000).
- `NODE_ENV=production` requires an HTTPS app origin and sets Secure session cookies.
- Serve the UI from Express by default; use `SERVE_WEB=false` only with a deliberately configured development server.

The image runs as the non-root `node` user. Build dependencies and demo tooling are excluded from the runtime dependency set. No secrets belong in the image or repository.

## Health and shutdown

`/api/health` checks process liveness. `/api/ready` performs a database ping. The container health check uses readiness.

On SIGINT/SIGTERM, the service stops scheduling worker claims, waits for the current job, closes the HTTP server, and closes its database client. A ten-second deadline bounds shutdown. If a process is killed, any outstanding lease becomes eligible again after 30 seconds.

## Outbox inspection

Useful operational counts in the database are jobs by `state`, oldest ready job's `availableAt`, expired leased jobs, and `dead` jobs. This release does not expose an unauthenticated metrics endpoint.

Before replaying a dead job, investigate `lastError`, ensure the recipient memberships remain appropriate, and back up the affected records. A controlled operator may reset that job to `ready`, `attempts: 0`, and a current `availableAt`, clearing its old lease fields. Replays are idempotent for this in-app delivery implementation. Do not assume the same for a future external email integration.

## Backups and access

Back up MongoDB on a schedule and test restoring it into an isolated environment. Store secrets in the deployment platform's secret store. Use authenticated database access and network restrictions; do not publish the database port.

Logs intentionally omit credentials, cookie values, and payload bodies. Unexpected API errors contain a request ID and an error type. Add structured monitoring before running this for real users.

## What has not been load-tested

There is no measured multi-region or horizontal-scale claim. The HTTP rate limiter is process-local, and no distributed session invalidation cache is involved because sessions are checked against MongoDB. Search is a bounded escaped regex over tenant-scoped titles. Establish a realistic workload and test latency, index plans, worker throughput, and database capacity before scaling.
