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
- Firebase Hosting preview-channel behavior
- domain/cookie behavior outside localhost
- payment flow with Dodo test-mode checkout and test cards
- final pre-prod integration checks

Cloud verification must be explicit:

```bash
pnpm qa:prepare:dev-cloud
pnpm cloud-run:deploy:dev-cloud
pnpm db:sync:legacy-templates:dev-cloud
```

If `db push` stops on a dev-cloud-only warning about data loss, rerun the refresh with:

```bash
pnpm qa:prepare:dev-cloud:accept-data-loss
```

Frontend QA deploy for MoTrend should use the frontend repo preview script:

```bash
cd /Users/malevich/Documents/Playground/motrend
./deploy-preview.sh qa
```

For the isolated pro contour (AEO/LAB):

```bash
cp .env.pro.example .env.pro.local
pnpm cloud-sql:bootstrap:pro
pnpm db:sync:managed:pro
pnpm cloud-run:deploy:pro
pnpm cloud-frontends:deploy:pro
pnpm cloud-lb:bootstrap:pro-gateway
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
- browser QA hosts: Firebase Hosting preview channels plus `gen-lang-client-0651837818.web.app` / `gen-lang-client-0651837818.firebaseapp.com`
- payment mode: `DODO_ENVIRONMENT=test_mode`

This does not replace the local-first workflow. It only fixes the current cloud verification target for deploy-shaped checks.

For config parity without deploying anything, render a fresh local dev-cloud env from the live cloud contour:

```bash
pnpm env:render:dev-cloud
```

That command is read-only against Cloud Run and Secret Manager. It rebuilds `.env.dev-cloud.local`, swaps in dev-cloud endpoints and queue names, and leaves `MOTREND_PROVIDER_MODE=manual` unless you explicitly override it.

`pnpm dev:dev-cloud` and the DB-backed `*:dev-cloud` commands automatically start a local Cloud SQL Auth Proxy session. That lets local QA use the rendered Cloud Run credentials without editing `DATABASE_URL` by hand.

Before payment QA, upsert credit packs in dev-cloud so the checkout buttons use the correct Dodo test product IDs:

```bash
pnpm billing:credit-packs:upsert:dev-cloud
```

Then run checkout only from the preview/non-prod frontend contour. That keeps browser origin, cookie, API, Cloud SQL, Cloud Tasks, and Dodo payments inside the dev boundary instead of leaking through `trend.moads.agency`.

The default `qa:prepare:dev-cloud` flow intentionally skips legacy Firestore template sync. Run `pnpm db:sync:legacy-templates:dev-cloud` only when you explicitly need parity with that legacy tail and your Google auth session is valid.
Queue reconciliation is also explicit. Run `pnpm cloud-tasks:ensure:dev-cloud` only when queue settings changed or the dev queues drifted.

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
- MoTrend payment QA is the exception: preview channels are the correct browser contour for test-mode checkout because they bind to `api-dev.moads.agency` instead of `api.moads.agency`.
- Cloud Tasks / Secret Manager / Cloud Run API enablement is for explicit verification only, not as a default dev loop.
- Compute Engine API and HTTPS Load Balancer resources are prod-only overhead; do not turn them into the default dev loop.
- No dev Redis, Memorystore, or n8n in the default contour.
- Full browser smoke depends on `api-dev.moads.agency` resolving to the dev Cloud Run service. Without that custom-domain DNS step, verification is limited to API/runtime smoke on the default Cloud Run URL.
- Do not test Dodo checkout from `trend.moads.agency`; use preview/non-prod hosts plus Dodo test cards only.

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
