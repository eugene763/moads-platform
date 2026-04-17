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
- `pnpm cloud-run:deploy:pro`
- `pnpm cloud-frontends:deploy:pro`
- `pnpm cloud-lb:bootstrap:prod`
- `pnpm cloud-lb:bootstrap:pro-gateway`
- `pnpm db:sync:managed:prod`
- `pnpm db:sync:managed:pro`
- `pnpm cloud-sql:bootstrap:pro`
- `pnpm db:sync:legacy-templates:dev-cloud`
- `pnpm motrend:tasks:run`
- `pnpm motrend:tasks:run:dev-cloud`
- `pnpm motrend:sweep:run`
- `pnpm motrend:sweep:run:dev-cloud`
- `pnpm motrend:downloads:cleanup`
- `pnpm motrend:downloads:cleanup:dev-cloud`
- `pnpm env:render:dev-cloud`
- `pnpm qa:prepare:dev-cloud`
- `pnpm qa:prepare:dev-cloud:accept-data-loss`

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
- `TASK_DISPATCH_MODE=cloud-tasks` requires `CLOUD_TASKS_MOTREND_SUBMIT_QUEUE`, `CLOUD_TASKS_MOTREND_POLL_QUEUE`, `CLOUD_TASKS_MOTREND_DOWNLOAD_QUEUE`, and `CLOUD_TASKS_INVOKER_SERVICE_ACCOUNT_EMAIL`.
- `pnpm cloud-tasks:ensure:*` is idempotent: it creates missing queues and updates existing queue rate/retry parameters to repo-owned defaults.
- Cloud Tasks calls Cloud Run internal routes through Google OIDC; `x-moads-internal-key` remains only for local/internal-http flows.
- The dev Cloud Run deploy path is source-based from the repo root `Dockerfile`; the runtime intentionally starts `tsx services/api/src/server.ts` so workspace packages stay usable before a dedicated production bundling pass.
- `pnpm db:sync:managed:dev-cloud` uses Cloud SQL Auth Proxy plus the `MOADS_PLATFORM_DEV_APP_PASSWORD` secret to run `prisma db push`, seed, and legacy template sync against managed Postgres.
- `pnpm cloud-run:deploy:dev-cloud` expects `SESSION_COOKIE_SECRET_DEV` when available, plus `MOADS_API_DEV_DATABASE_URL`, `KLING_ACCESS_KEY`, and `KLING_SECRET_KEY` in Secret Manager; it falls back to the shared `SESSION_COOKIE_SECRET` only when the dev-specific cookie secret does not exist. `FIREBASE_SERVICE_ACCOUNT` is optional because Cloud Run ADC can be used when the runtime service account has the required Firebase roles.
- `dev-cloud` currently uses `moads_session_dev` so browser sessions do not collide with `prod`.
- Local `dev:dev-cloud` and the DB-backed `*:dev-cloud` helper scripts now start a Cloud SQL Auth Proxy automatically and rewrite the Cloud Run-style `DATABASE_URL` to a local proxy connection for the duration of the command.
- `pnpm cloud-run:deploy:prod` deploys `moads-api` with ingress `internal-and-cloud-load-balancing`; prod traffic must enter through the HTTPS Load Balancer path, not directly through `run.app`.
- `pnpm cloud-run:deploy:pro` deploys the pro contour API service `moads-api-pro` in a separate project/runtime and defaults all AEO external connectors to `mock` mode.
- `pnpm cloud-frontends:deploy:pro` deploys `apps/aeo-web` and `apps/lab-web` to dedicated Cloud Run services, creates/updates Firebase Hosting pro sites, and maps `aeo.moads.agency` / `lab.moads.agency` to the correct frontend sites.
- `pnpm cloud-lb:bootstrap:pro-gateway` configures path routing on `api.moads.agency` so `/v1/aeo/*`, `/v1/lab/*`, `/v1/auth/*`, `/v1/wallet/*`, and `/v1/me/*` target the pro backend while legacy consumer paths remain on the consumer backend.
- `pnpm cloud-lb:bootstrap:prod` creates or updates the HTTPS LB resources for `api.moads.agency` and prints the IPv4/IPv6 records that must exist in DNS.
- `pnpm db:sync:managed:prod` uses Cloud SQL Auth Proxy plus the `MOADS_PLATFORM_PROD_APP_PASSWORD` secret to run `prisma db push`, seed, legacy support-code backfill, and legacy template sync against prod Postgres.
- `pnpm db:sync:managed:pro` uses Cloud SQL Auth Proxy plus `MOADS_PLATFORM_PRO_APP_PASSWORD` and applies schema + seed in the isolated pro database.
- Full browser-level smoke from `trend.moads.agency` still requires `api-dev.moads.agency` to be mapped and resolvable; until that DNS step is complete, only API/runtime smoke can run against the default `run.app` URL.
- stale `awaiting_upload`, pre-submit `queued`, and long-running `processing` jobs can be cleaned up via `pnpm motrend:sweep:run` or `POST /internal/motrend/jobs/run-sweep`.
- expired cached download artifacts can be cleaned up via `pnpm motrend:downloads:cleanup` or `POST /internal/motrend/downloads/run-cleanup`.
- Safe non-Kling iteration is supported through `MOTREND_PROVIDER_MODE=manual` plus `POST /internal/motrend/jobs/:id/simulate-provider-result` in non-prod.
- `MOTREND_PROVIDER_MODE=kling` now speaks directly to Kling's motion-control API, but this repo intentionally verifies it only via unit tests and mocked fetch responses unless you explicitly opt into cloud smoke checks.
- Required APIs for cloud queue wiring: `cloudtasks.googleapis.com`, `run.googleapis.com`, `secretmanager.googleapis.com`.
- Required APIs for the prod HTTPS Load Balancer path: `compute.googleapis.com`, plus the Cloud Run / Cloud SQL / Cloud Tasks APIs already listed above.
- `pnpm db:sync:legacy-templates:*` is cloud-only by design and is intentionally excluded from local bootstrap.
- Prisma Dev remains available through `pnpm db:dev:start`, but only as a fallback when Docker Postgres is unavailable.
- Runtime topology and safe `prod -> dev-cloud` sync rules live in `docs/runtime-topology.md`.
- `pnpm env:render:dev-cloud` is read-only against cloud resources: it reads the live `moads-api` Cloud Run config plus Secret Manager values and rewrites them into a local `.env.dev-cloud.local` for testing. It keeps `MOTREND_PROVIDER_MODE=manual` by default so secrets are present but real Kling generation does not start accidentally.
- Safe Firebase QA for MoTrend should run from a Firebase Hosting preview channel or `*.web.app` / `*.firebaseapp.com` host, not from `trend.moads.agency`. Those QA frontend hosts are expected to target `https://api-dev.moads.agency`.
- `dev-cloud` intentionally defaults `API_ALLOWED_ORIGINS` to localhost plus Firebase preview hosts. `trend.moads.agency` is no longer part of the default dev-cloud browser contour.
- `pnpm qa:prepare:dev-cloud` is the shortest path to refresh the verification contour before feature QA: it renders `.env.dev-cloud.local`, syncs dev Cloud SQL, and upserts MoTrend credit packs using the active `DODO_ENVIRONMENT`.
- `pnpm cloud-tasks:ensure:dev-cloud` stays explicit. Run it when queue config changes or after infra drift, not on every QA refresh.
- `pnpm qa:prepare:dev-cloud` intentionally skips Firestore legacy template sync so the default QA refresh does not depend on a legacy contour or interactive Google reauth. If you explicitly need that parity check, run `pnpm db:sync:legacy-templates:dev-cloud` afterward.
- If dev Cloud SQL has accumulated drift and `prisma db push` stops on a data-loss warning, use `pnpm qa:prepare:dev-cloud:accept-data-loss`. That flag is for `dev-cloud` only and must never be mirrored into `prod`.
- Payment QA should happen only after `pnpm billing:credit-packs:upsert:dev-cloud` has run with `DODO_ENVIRONMENT=test_mode`, so checkout links point at Dodo test products rather than live products.
