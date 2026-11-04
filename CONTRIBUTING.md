# Contributing to Opsflow

## Prepare a change

Use Node.js 24 and the pnpm version pinned in `package.json`. Install dependencies with `pnpm install --frozen-lockfile`, then create a branch from the latest `main`.

Keep each pull request focused on one problem. Explain the user-visible behavior, any data or API changes, and the checks you ran. Never commit credentials, session cookies, database exports, or personal production data. Report security concerns through [SECURITY.md](SECURITY.md).

## Validate locally

```sh
pnpm check
pnpm exec playwright install chromium
pnpm test:e2e
pnpm audit --prod --audit-level high
```

`pnpm check` runs formatting, lint, type checks, integration tests with coverage thresholds, and the production build. Integration and browser tests launch a temporary MongoDB replica set; allow the test tooling to download its MongoDB binary on first use. Browser tests also need an available port 4000, so stop a running demo before starting them.

For behavior changes, add a regression test that exercises the failure or boundary being changed. Tenant isolation, permission checks, independent approvals, optimistic conflicts, and outbox recovery must remain covered. See [the verification record](docs/verification.md) for the tested cases and limits.

## Merge requirements

`main` requires a pull request and a successful GitHub Actions `verify` check. The branch must be up to date with `main`; update it and wait for checks again if another change merges first. Resolve outstanding review conversations before merging. These protections also apply to administrators, and force pushes and deletion of `main` are blocked.

CI additionally installs Chromium's system dependencies and builds the production Docker image. A local pass is useful evidence, but the required GitHub check must pass for the current PR revision. Review the diff and test results before merging; external review is welcome when available.

## Dependency updates

Keep action references pinned to full commit SHAs. Keep `@types/node` aligned with the Node 24 runtime, and use a TypeScript compiler supported by the lint tooling. Major runtime or compiler migrations need an explicit compatibility review rather than an automatic version bump. Commit the regenerated lockfile with dependency changes.
