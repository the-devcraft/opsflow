# Verification record

This file records executed checks and their practical limits. It is not a guarantee of defect-free software.

## Environment

- Local development host: Windows, Node.js 24.
- Database tests: actual MongoDB 8.2.6 single-node replica set launched by mongodb-memory-server.
- Browser tests: Chromium through Playwright.

## Checks

Local checks executed on 29 October 2026:

| Check                                 | Result                                                                                     |
| ------------------------------------- | ------------------------------------------------------------------------------------------ |
| Formatting, ESLint, TypeScript        | Passed                                                                                     |
| MongoDB replica-set integration suite | 26 passed                                                                                  |
| Chromium browser suite                | 4 passed                                                                                   |
| Accessibility scan                    | No violations in the checked WCAG A/AA rules on sign-in, overview, and request dialog      |
| Production build                      | Passed                                                                                     |
| Production dependency advisory audit  | No known vulnerabilities reported at the time of this check                                |
| Server coverage                       | 85.35% statements, 82.38% branches, 80.76% functions, 86.66% lines                         |
| Manual visual review                  | Sign-in, overview, and review drawer inspected; screenshots captured from the working demo |

Coverage excludes startup and demo seeding. The worker scheduler is also exercised by browser tests, which are not included in Vitest's coverage calculation. These numbers measure this executed suite; they are not a security certification or a claim that untested paths cannot fail.

Local Docker execution was unavailable on the development host. The [first main-branch CI run](https://github.com/the-devcraft/opsflow/actions/runs/40777841725), for commit `1d2c32a`, completed successfully on Ubuntu. Its core checks, Chromium suite, production dependency audit, and production Docker image build all passed. A successful image build does not by itself verify a deployed container's runtime behavior or the Compose integration stack.

## Important test cases

- Cross-tenant lists and direct object IDs, including a caller who owns both workspaces.
- Immediate membership revocation and limits on privilege assignment.
- Revoked and expired sessions, origin checks, rate limits, strict input schemas, and body limits.
- Independent review and optimistic conflict handling under simultaneous decisions.
- Concurrent same-key creation, payload mismatch detection, sequence consistency, and audit rollback.
- Competing worker claims, partial delivery recovery, recipient deduplication, retries, and dead-lettering.
- Two-user browser approval flow, notification visibility, workspace switching, mobile drawer behavior, and account onboarding.

Docker availability, external deployment, independent penetration testing, and load testing must be reported separately. A green compile does not verify those properties.
