# Dev Workflow

## Default mode: local

Stay local for:

- coding
- schema changes and migrations
- seed and smoke data
- auth flow testing
- local API contract work
- frontend development against localhost

Default local stack:

- `.env.local`
- Docker Postgres on `127.0.0.1:5432`
- Firebase emulators on `127.0.0.1`
- `MOADS_ENV=local`
- demo Firebase project id `demo-moads-local`

Typical local session:

```bash
pnpm db:start:local
pnpm db:generate
pnpm db:push
pnpm db:seed
pnpm firebase:emulators:start
pnpm dev
```

## Dev cloud: explicit verification only

Use `dev-cloud` only when you need to verify:

- Cloud SQL connectivity
- Cloud Run runtime behavior
- real Firebase project wiring
- domain/cookie behavior outside localhost
- final pre-prod integration checks

Cloud verification must be explicit:

```bash
pnpm env:render:dev-cloud
pnpm db:validate:dev-cloud
pnpm db:sync:managed:dev-cloud
pnpm cloud-run:deploy:dev-cloud
pnpm db:sync:legacy-templates:dev-cloud
pnpm dev:dev-cloud
```

`dev-cloud` is not the default shared environment and should not be left running for convenience.

Current canonical MoTrend cloud verification target:

- project: `gen-lang-client-0651837818`
- region: `us-central1`
- runtime target: `api-dev.moads.agency`
- service: `moads-api-dev`
- Cloud SQL: `moads-platform-dev`
- queues: `motrend-submit`, `motrend-poll`, `motrend-download`
- cookie: `moads_session_dev`

This does not replace the local-first workflow. It only fixes the current cloud verification target for deploy-shaped checks.

For config parity without deploying anything, render a fresh local dev-cloud env from the live cloud contour:

```bash
pnpm env:render:dev-cloud
```

That command is read-only against Cloud Run and Secret Manager. It rebuilds `.env.dev-cloud.local`, swaps in dev-cloud endpoints and queue names, and leaves `MOTREND_PROVIDER_MODE=manual` unless you explicitly override it.

## Production

`prod` is deploy/runtime only.

- Always set `MOADS_ENV=prod`.
- Do not enable Firebase emulators.
- Do not allow localhost origins.
- Do not use demo Firebase project ids.
- Keep dev and prod browser sessions isolated with different cookie names.
- Prod ingress is HTTPS Load Balancer -> Cloud Run with Cloud Run ingress set to `internal-and-cloud-load-balancing`.

## Cost control

Keep these defaults:

- Cloud SQL dev is off unless a cloud verification session is active.
- Cloud Run dev must use `min instances = 0`.
- Firebase preview channels are for UI review only, not for integration-heavy backend work.
- Cloud Tasks / Secret Manager / Cloud Run API enablement is for explicit verification only, not as a default dev loop.
- Compute Engine API and HTTPS Load Balancer resources are prod-only overhead; do not turn them into the default dev loop.
- No dev Redis, Memorystore, or n8n in the default contour.
- Full browser smoke depends on `api-dev.moads.agency` resolving to the dev Cloud Run service. Without that custom-domain DNS step, verification is limited to API/runtime smoke on the default Cloud Run URL.

## What costs money

- running Cloud SQL instances
- always-on Cloud Run instances
- long-lived preview/staging environments that talk to real backends

## What is safe to keep local

- Postgres in Docker
- Firebase emulators
- local API runs
- local test data
- local smoke checks
