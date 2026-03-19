# Dev Cloud SQL Pause / Stop Note

Use the existing dev Cloud SQL instance only for explicit cloud verification sessions.

## Before you start

- Confirm the task really needs managed Postgres behavior.
- Use the `dev-cloud` profile instead of reusing local defaults.
- Keep the session short and shut the instance back down when validation is done.

## When to stop it

Stop or pause the dev instance after:

- Cloud Run connectivity checks
- migration compatibility checks
- real cookie/domain validation
- final pre-prod smoke checks

## Cost guardrails

- Running Cloud SQL creates fixed cost while the instance is active.
- Stopped instances can still incur storage and IP charges.
- Do not assume the dev instance is always available.
- Do not wire local workflows to require Cloud SQL.

## Cloud Run dev defaults

If you manually deploy a dev Cloud Run service for verification:

- use `min instances = 0`
- keep memory conservative
- keep timeout conservative unless the check requires more
- tear the service down or leave it scale-to-zero when finished
