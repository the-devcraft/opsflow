# Showcase notes

## LinkedIn draft

I've been working on Opsflow, a multi-tenant operations workspace built with React, TypeScript, Express, and MongoDB.

The interesting part was keeping the workflow consistent when things go wrong:

- Two reviewers decide at the same time: only one decision can commit.
- A client retries a create request: the same idempotency key returns the same record.
- A notification worker stops halfway through delivery: its lease can be recovered without duplicating inbox records.
- A user knows another workspace's request ID: tenant-scoped authorization still denies access.

The repository includes the working UI, a temporary local demo, replica-set integration tests, browser and accessibility checks, CI, and architecture notes explaining the trade-offs.

It is a focused portfolio project, with the remaining production requirements documented rather than hidden behind a "production-ready" label.

Repository: https://github.com/the-devcraft/opsflow

## Talking points for a technical interview

1. Explain why checking membership alone is insufficient without tenant scope in entity queries.
2. Walk through a request transaction and explain what rolls back if the audit write fails.
3. Explain why a transaction plus a version check handles competing decisions.
4. Distinguish at-least-once delivery from idempotent effects and exactly-once claims.
5. Describe what would change for external email delivery or multiple API instances.
6. Show a failure test, then change the corresponding rule and explain why the test fails.
7. Discuss the deliberate omissions: email verification, ownership transfer, immutable external audit storage, and load testing.

Use the draft only after reviewing the implementation and being comfortable explaining the decisions. This file is a prepared draft; nothing has been posted to LinkedIn.
