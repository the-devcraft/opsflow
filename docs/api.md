# API reference

Base path: `/api`. JSON responses use explicit response views; persistence-only fields are not returned.

All writes require `Origin` to equal `APP_ORIGIN`. Authenticated endpoints use the `opsflow_session` cookie. No bearer token is stored in browser local storage.

| Method | Path                                                        | Purpose / permission                                |
| ------ | ----------------------------------------------------------- | --------------------------------------------------- |
| GET    | /health                                                     | Liveness and demo flag                              |
| GET    | /ready                                                      | Database readiness                                  |
| POST   | /auth/register                                              | `{name,email,password}`; password 12–128 characters |
| POST   | /auth/login                                                 | `{email,password}`; creates session cookie          |
| POST   | /auth/logout                                                | Revokes the current session                         |
| GET    | /me                                                         | User and current workspace memberships              |
| POST   | /workspaces                                                 | `{name}`; caller becomes owner                      |
| GET    | /workspaces/:workspaceId/summary                            | State counts and member count                       |
| GET    | /workspaces/:workspaceId/requests                           | List, filter, search, paginate                      |
| POST   | /workspaces/:workspaceId/requests                           | Create draft; Idempotency-Key required              |
| GET    | /workspaces/:workspaceId/requests/:requestId                | Scoped request detail                               |
| POST   | /workspaces/:workspaceId/requests/:requestId/transitions    | `{action,version,note?}`                            |
| GET    | /workspaces/:workspaceId/members                            | Current member views                                |
| POST   | /workspaces/:workspaceId/members                            | `{email,role}`; add or change role                  |
| DELETE | /workspaces/:workspaceId/members/:userId                    | Revoke membership                                   |
| GET    | /workspaces/:workspaceId/audit                              | Paginated audit records                             |
| GET    | /workspaces/:workspaceId/notifications                      | Latest 50 records for the caller                    |
| POST   | /workspaces/:workspaceId/notifications/:notificationId/read | Mark caller's record read                           |

## Request example

```json
{
  "title": "Shared incident workspace",
  "description": "The support team needs a shared workspace for incident coordination.",
  "category": "access",
  "priority": "high",
  "amountCents": 0
}
```

Categories: `purchase`, `access`, `change`. Priorities: `low`, `medium`, `high`. Amounts are nonnegative integer USD cents, capped at 100,000,000; this is an estimated amount field, not a payment system.

The `Idempotency-Key` header must contain 16–100 letters, numbers, underscores, or hyphens. Use a UUID and reuse it only when retrying the same input. A successful replay returns the same record with status 201. A changed payload under the same key returns 409.

```json
{ "action": "approve", "version": 2, "note": "Reviewed with the support lead." }
```

Actions are `submit`, `approve`, and `reject`. Only the author submits; only an independent owner/admin/approver decides. Rejection requires a note of at least five characters. Version mismatch returns 409; refetch before deciding again.

## Pagination and search

`GET /requests?limit=20&cursor=<last-id>&state=submitted&q=monitoring`

`limit` is 1–50. Cursor is a 24-character ObjectId from `nextCursor`. The list response is `{items,nextCursor}` with `null` at the end. The audit endpoint uses the same pagination shape. `q` is a literal, case-insensitive title substring up to 60 characters.

## Error envelope

```json
{
  "error": {
    "code": "version_conflict",
    "message": "This request changed. Refresh it before continuing.",
    "requestId": "server-generated-request-id"
  }
}
```

Validation errors also return `fields: [{path,message}]`. Common statuses: 400 invalid input; 401 missing/expired session; 403 permission or origin failure; 404 missing/inaccessible scoped resource; 409 state/version/replay conflict; 413 oversized payload; 429 rate limit; 500 unexpected internal failure. The global rate limiter may return its default plain-text 429 response; the client handles that fallback.
