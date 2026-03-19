# Local DB

The default database workflow is local Postgres via Docker Compose.

## Start local Postgres

```bash
pnpm db:start:local
```

This starts the Postgres 16 container defined in `docker-compose.local.yml` on `127.0.0.1:5432`.

## Apply schema and seed local data

```bash
pnpm db:generate
pnpm db:validate
pnpm db:push
pnpm db:seed
```

The default local seed creates a `motrend` smoke-test template with code `dev-template-001` and points it at a local placeholder reference asset served by the Firebase Hosting emulator.

## Run queued MoTrend provider tasks

```bash
pnpm motrend:tasks:run
```

This claims due SQL-backed `motrend.job_tasks` entries and processes `submit` / `poll` work without relying on legacy Cloud Functions.

If you want `finalize` and `refresh` to kick the worker automatically during local testing, run the API with:

```bash
TASK_DISPATCH_MODE=internal-http
```

For managed environments, bootstrap the Cloud Tasks queue before you flip to `TASK_DISPATCH_MODE=cloud-tasks`:

```bash
pnpm cloud-tasks:ensure:dev-cloud
```

The queue bootstrap is idempotent: it creates missing queues and updates rate/retry settings when queues already exist.

To clean up stale SQL jobs and refund timed-out processing safely:

```bash
pnpm motrend:sweep:run
```

To remove expired cached download artifacts from SQL and Storage:

```bash
pnpm motrend:downloads:cleanup
```

For safe local testing without Kling, keep `MOTREND_PROVIDER_MODE=manual` and use the internal simulate route after finalize:

```bash
curl -X POST http://localhost:8080/internal/motrend/jobs/JOB_ID/simulate-provider-result \
  -H "Content-Type: application/json" \
  -H "x-moads-internal-key: CHANGE_ME_INTERNAL_ONLY" \
  -d '{"state":"succeed","outputUrl":"https://example.com/test.mp4"}'
```

`MOTREND_PROVIDER_MODE=kling` is runtime-ready for dev-cloud/prod, but it is intentionally not part of the default local loop.

## Stop or reset the local database

```bash
pnpm db:stop:local
pnpm db:reset:local
```

`db:reset:local` removes only the local Docker container and volume. It does not read or destroy an arbitrary `DATABASE_URL`.

## Cloud-only template sync

The Firestore template sync is no longer part of local bootstrap.

Use it only with an explicit cloud profile:

```bash
pnpm db:sync:legacy-templates:dev-cloud
```

The sync script refuses to run in `MOADS_ENV=local`.

## Prisma Dev fallback

If Docker is unavailable, Prisma Dev can still be used as an emergency fallback:

```bash
pnpm db:dev:start
pnpm --filter @moads/db prisma dev ls
```

If you use the Prisma Dev TCP URL, remember to add `pgbouncer=true`:

```bash
postgres://postgres:postgres@localhost:51214/template1?sslmode=disable&pgbouncer=true&connection_limit=1
```
