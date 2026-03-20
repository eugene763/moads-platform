# MoTrend Support ID vs Job ID

## Key distinction

- `U-XXXXXXXXXX` is a support code (`core.support_profiles.support_code`).
- `jobId` is a SQL job identifier from `motrend.jobs.id` (typically starts with `c`).

Do not use `U-*` as a job lookup key in incident response.

## Fast lookup flow

1. Resolve account by support code from `core.support_profiles`.
2. Read recent jobs from `motrend.jobs` by `account_id`.
3. Investigate or recover using real SQL `jobId`.

## Incident note (manual mode recovery)

If a job is stuck in `PROCESSING` with `provider_task_id` starting with `manual:`,
use the approved recovery policy:

- mark job `FAILED`
- apply exactly one ledger refund entry
- write audit reason `manual_mode_recovery_refund`

This keeps recovery idempotent and prevents duplicate charge/refund paths.
