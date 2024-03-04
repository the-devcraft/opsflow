# Security model

## Assets and trust boundaries

The primary assets are tenant-scoped request content, membership privileges, credentials, sessions, and audit records. The browser is untrusted. IDs, roles, monetary amounts, state transitions, and workspace identifiers are validated again on the server.

### Controls included

- Passwords use salted scrypt; neither plaintext passwords nor hashes are returned by the API.
- Session tokens contain 256 bits of randomness. Only their SHA-256 hashes are stored. Database expiration is checked before the TTL cleanup happens.
- Cookies are HttpOnly, SameSite=Strict, and Secure in production. Logout deletes the backing session.
- Unsafe requests require an exact configured `Origin`, including login and registration. Same-origin browser fetches send this automatically. This API is intended for its browser client; non-browser integrations would need a documented authentication/CSRF model.
- Tenant membership is checked on every scoped request. Each object lookup repeats tenant scope. Notifications additionally include recipient scope.
- Request bodies use strict schemas and bounded strings. Unknown fields are rejected. Mongo query objects cannot be supplied through the payload.
- JSON bodies are capped at 32 KiB. Authentication attempts and API traffic are rate-limited.
- Review permission is separate from request authorship. Privileged users cannot approve their own request.
- Helmet applies security headers. Errors include a request ID and hide internal stack traces and database details.
- API responses are marked `Cache-Control: no-store`. Client workspace caches are partitioned by workspace ID and removed on logout.

## Deliberate exclusions

This project does not implement email verification, account recovery, MFA, organization-domain verification, fine-grained approval policies, encryption key management, malicious administrator defense, or an external immutable audit ledger. It has not undergone an independent penetration test.

Production TLS terminates at a reverse proxy. Do not expose MongoDB publicly. Use database authentication, least-privilege credentials, backups, and restricted network access. The Compose file's unauthenticated single-node database is only a local integration example.

The app does not enable `trust proxy` automatically. Do not accept arbitrary forwarded client addresses. A real multi-instance deployment requires a deliberately configured proxy trust boundary and a shared rate-limit store.

## Audit privacy

Audit details may contain request titles, review notes, and member names. They are visible to members of the same workspace. Retention, deletion, and legal obligations must be decided before collecting real organization data. Do not use the demo for confidential information.

## Reporting a vulnerability

Do not post passwords, session cookies, or confidential tenant data in a public issue. Use a private GitHub security advisory if available, with reproduction steps against a local instance and redacted evidence.
