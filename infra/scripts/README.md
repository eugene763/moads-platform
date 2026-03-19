# Infra Scripts

This folder contains repo-owned helpers for:

- local-only Postgres workflows
- Firebase emulator startup
- legacy import/export and migration scripts
- Cloud Tasks queue bootstrap
- operator notes for cost-sensitive cloud checks

Cloud queue bootstrap scripts are expected to be idempotent and safe to re-run.

Local dev helpers live under `infra/scripts/dev/`.
