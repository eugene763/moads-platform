# MO Ads Platform

Shared platform backbone for MO Ads products:

- `motrend` as the first consumer product
- `lab`, `aeo`, and `ugc` as pro products on the same core

The repo is intentionally backend-first. `motrend` keeps its existing legacy frontend for now while this repo establishes:

- multi-schema PostgreSQL with Prisma
- shared Fastify API
- Firebase Auth session-cookie bootstrap
- ledger-based credits and product-scoped access
- SQL-backed MoTrend migration layer

## Workspace Layout

```text
apps/
  motrend-web/
  lab-web/
  aeo-web/
  ugc-web/
services/
  api/
packages/
  db/
  sdk/
  ui/
  config/
infra/
  firebase/
  sql/
  scripts/
docs/
```

## Quick Start

1. Copy `.env.local.example` to `.env.local`.
2. Install dependencies with `pnpm install`.
3. Start local Postgres with `pnpm db:start:local`.
4. Generate Prisma client with `pnpm db:generate`.
5. Validate and apply the schema with `pnpm db:validate` and `pnpm db:push`.
6. Seed local data with `pnpm db:seed`.
7. In a second terminal, start Firebase emulators with `pnpm firebase:emulators:start`.
8. Start the API with `pnpm dev`.

The default local stack is:

- Postgres via `docker-compose.local.yml`
- API via `.env.local`
- Firebase Auth, Hosting, and Storage via Emulator Suite
- demo Firebase project id `demo-moads-local`

## Common Commands

- `pnpm dev`
- `pnpm dev:dev-cloud`
- `pnpm build`
- `pnpm typecheck`
- `pnpm test`
- `pnpm db:start:local`
- `pnpm db:stop:local`
- `pnpm db:reset:local`
- `pnpm db:generate`
- `pnpm db:push`
- `pnpm db:seed`
- `pnpm db:validate`
- `pnpm firebase:emulators:start`
- `pnpm db:validate:dev-cloud`
- `pnpm db:sync:managed:dev-cloud`
- `pnpm cloud-tasks:ensure:dev-cloud`
- `pnpm cloud-tasks:ensure:prod`
- `pnpm cloud-run:deploy:dev-cloud`
- `pnpm cloud-run:deploy:prod`
- `pnpm cloud-lb:bootstrap:prod`
- `pnpm db:sync:managed:prod`
- `pnpm db:sync:legacy-templates:dev-cloud`
- `pnpm motrend:tasks:run`
- `pnpm motrend:tasks:run:dev-cloud`
- `pnpm motrend:sweep:run`
- `pnpm motrend:sweep:run:dev-cloud`
- `pnpm motrend:downloads:cleanup`
- `pnpm motrend:downloads:cleanup:dev-cloud`

## Environment Profiles

- `local`: default development profile, always local-first, requires localhost Postgres and Firebase emulators.
- `dev-cloud`: explicit profile for checking managed Postgres / Cloud Run / real Firebase behavior against the existing dev project.
- Current canonical MoTrend cloud verification target: `gen-lang-client-0651837818` in `us-central1`.
- `prod`: explicit deploy/runtime profile only. Production deploys must set `MOADS_ENV=prod`.

Local scripts never read `.env`, `.env.dev-cloud.local`, or `.env.prod.local` implicitly. Use the explicit profile-specific commands when you need cloud validation.

## Notes

- Session login resolves the target product from the request host, not from arbitrary client payload.
- Temporary test credits are granted only once, and only when a personal account first gains `motrend` membership.
- Gift notices must key off `session-login` bootstrap metadata, not Firebase `isNewUser`.
- `finalize` now enqueues SQL-backed MoTrend provider tasks; use `pnpm motrend:tasks:run` or `POST /internal/motrend/tasks/run-due` to process them outside local request/response flow.
- `TASK_DISPATCH_MODE=internal-http` lets the API auto-kick `/internal/motrend/tasks/run-due` after `finalize` / `refresh`; `TASK_DISPATCH_MODE=cloud-tasks` uses split queues with the same internal route contract.
- `TASK_DISPATCH_MODE=cloud-tasks` requires `CLOUD_TASKS_MOTREND_SUBMIT_QUEUE`, `CLOUD_TASKS_MOTREND_POLL_QUEUE`, and `CLOUD_TASKS_INVOKER_SERVICE_ACCOUNT_EMAIL`.
- `pnpm cloud-tasks:ensure:*` is idempotent: it creates missing queues and updates existing queue rate/retry parameters to repo-owned defaults.
- Cloud Tasks calls Cloud Run internal routes through Google OIDC; `x-moads-internal-key` remains only for local/internal-http flows.
- The dev Cloud Run deploy path is source-based from the repo root `Dockerfile`; the runtime intentionally starts `tsx services/api/src/server.ts` so workspace packages stay usable before a dedicated production bundling pass.
- `pnpm db:sync:managed:dev-cloud` uses Cloud SQL Auth Proxy plus the `MOADS_PLATFORM_DEV_APP_PASSWORD` secret to run `prisma db push`, seed, and legacy template sync against managed Postgres.
- `pnpm cloud-run:deploy:dev-cloud` expects `SESSION_COOKIE_SECRET`, `MOADS_API_DEV_DATABASE_URL`, `KLING_ACCESS_KEY`, and `KLING_SECRET_KEY` in Secret Manager; `FIREBASE_SERVICE_ACCOUNT` is optional because Cloud Run ADC can be used when the runtime service account has the required Firebase roles.
- `dev-cloud` should use a separate cookie name such as `moads_session_dev` so browser sessions do not collide with `prod`.
- `pnpm cloud-run:deploy:prod` deploys `moads-api` with ingress `internal-and-cloud-load-balancing`; prod traffic must enter through the HTTPS Load Balancer path, not directly through `run.app`.
- `pnpm cloud-lb:bootstrap:prod` creates or updates the HTTPS LB resources for `api.moads.agency` and prints the IPv4/IPv6 records that must exist in DNS.
- `pnpm db:sync:managed:prod` uses Cloud SQL Auth Proxy plus the `MOADS_PLATFORM_PROD_APP_PASSWORD` secret to run `prisma db push`, seed, legacy support-code backfill, and legacy template sync against prod Postgres.
- Full browser-level smoke from `trend.moads.agency` still requires `api-dev.moads.agency` to be mapped and resolvable; until that DNS step is complete, only API/runtime smoke can run against the default `run.app` URL.
- stale `awaiting_upload`, pre-submit `queued`, and long-running `processing` jobs can be cleaned up via `pnpm motrend:sweep:run` or `POST /internal/motrend/jobs/run-sweep`.
- expired cached download artifacts can be cleaned up via `pnpm motrend:downloads:cleanup` or `POST /internal/motrend/downloads/run-cleanup`.
- Safe non-Kling iteration is supported through `MOTREND_PROVIDER_MODE=manual` plus `POST /internal/motrend/jobs/:id/simulate-provider-result` in non-prod.
- `MOTREND_PROVIDER_MODE=kling` now speaks directly to Kling's motion-control API, but this repo intentionally verifies it only via unit tests and mocked fetch responses unless you explicitly opt into cloud smoke checks.
- Required APIs for cloud queue wiring: `cloudtasks.googleapis.com`, `run.googleapis.com`, `secretmanager.googleapis.com`.
- Required APIs for the prod HTTPS Load Balancer path: `compute.googleapis.com`, plus the Cloud Run / Cloud SQL / Cloud Tasks APIs already listed above.
- `pnpm db:sync:legacy-templates:*` is cloud-only by design and is intentionally excluded from local bootstrap.
- Prisma Dev remains available through `pnpm db:dev:start`, but only as a fallback when Docker Postgres is unavailable.
