# AEO Production Handover

Last updated: 2026-04-29

## Production URLs

- AEO web: `https://aeo.moads.agency`
- API: `https://api.moads.agency`
- Privacy Policy: `https://moads.agency/privacy`

## Dev-Cloud URLs

- AEO web: `https://aeo-dev.moads.agency`
- API: `https://api-dev.moads.agency`

## Runtime Map

- GCP/Firebase project: `gen-lang-client-0651837818`
- Region: `us-central1`
- Prod API service: `moads-api`
- Pro API service: `moads-api-pro`
- Dev API service: `moads-api-dev`
- Prod AEO web service: `moads-aeo-web`
- Dev AEO web service: `moads-aeo-web-dev`
- Prod Lab web service: `moads-lab-web`
- Prod AEO Firebase Hosting site: `moads-aeo`
- Prod Lab Firebase Hosting site: `moads-lab`
- Prod API database: `moads-platform-prod`
- Pro API database: `moads-platform-pro`
- Dev-cloud database: `moads-platform-dev`

## Env Summary

Do not store secret values in docs or commits.

Prod API:

- `MOADS_ENV=prod`
- `NODE_ENV=production`
- `SESSION_COOKIE_NAME=moads_session`
- `API_BASE_URL=https://api.moads.agency`
- `API_ALLOWED_ORIGINS` must include explicit production frontend origins only.
- `DATABASE_URL` is supplied from Secret Manager.
- `SESSION_COOKIE_SECRET` is supplied from Secret Manager.
- `DODO_ENVIRONMENT=live_mode`
- `DODO_API_KEY` and `DODO_WEBHOOK_KEY` are supplied from live Secret Manager secrets.

Dev-cloud API:

- `MOADS_ENV=dev-cloud`
- `SESSION_COOKIE_NAME=moads_session_dev`
- `API_BASE_URL=https://api-dev.moads.agency`
- `API_ALLOWED_ORIGINS` must include explicit dev frontend origins only.
- `DATABASE_URL` is supplied from the dev Cloud SQL secret.
- `DODO_ENVIRONMENT=test_mode`
- Dodo secrets must point to test-mode credentials.

Prod AEO web:

- `NEXT_PUBLIC_API_BASE_URL=https://api.moads.agency`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=aeo.moads.agency` after Firebase Auth and Google OAuth domains are configured.
- `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, and `NEXT_PUBLIC_FIREBASE_APP_ID` are public Firebase config values, not backend secrets.

Dev AEO web:

- `NEXT_PUBLIC_API_BASE_URL=https://api-dev.moads.agency`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=aeo-dev.moads.agency` or the current approved dev auth domain.

## Dodo Live/Test Separation

- Prod must use `DODO_ENVIRONMENT=live_mode` with live product IDs in the prod database.
- Dev-cloud must use `DODO_ENVIRONMENT=test_mode` with test product IDs in the dev database.
- Credits are granted only through backend webhook/ledger flows, not return URL query parameters.
- Return/cancel query parameters are UI feedback only.
- Never copy live Dodo product IDs into dev packs or test Dodo product IDs into prod packs.

## Deploy Order

1. Confirm branch, diff, and checks.
2. Validate any DB migration or seed change locally first.
3. If pack metadata changed, upsert packs in the target environment before frontend smoke.
4. Deploy API before frontend when frontend depends on new API behavior.
5. Deploy AEO web after API is healthy.
6. Deploy Firebase Hosting/domain rewrites only when routing or custom domain mappings changed.
7. Run the smoke checklist below.

## Rollback Notes

- Cloud Run API rollback: route traffic back to the previous healthy `moads-api` revision.
- Cloud Run AEO web rollback: route traffic back to the previous healthy `moads-aeo-web` revision.
- Firebase Hosting rollback: roll back the last Hosting release for `moads-aeo` only if Hosting was changed.
- Avoid destructive DB rollback. For schema changes, prepare a forward fix unless a tested down migration exists.
- Dodo webhook grants should remain idempotent through operation keys; verify ledger state before any manual correction.

## Smoke Checklist

- Homepage loads at `https://aeo.moads.agency`.
- Prod remains indexable: no prod `X-Robots-Tag: noindex` and no prod robots disallow.
- Invalid/random domains fail without a score or recommendations.
- Public scan succeeds for a known reachable site.
- Auth sign-in works and returns to `/scans` when expected.
- Existing scans load in authenticated workspace.
- Deep Site Scan with enough credits completes and debits 1 credit.
- Deep Site Scan with insufficient credits opens the credit pack path and does not run scanner work.
- Credit pack modal loads packs and checkout starts for an authenticated user.
- Payment success/cancel return parameters show UI feedback only.
- Scan/site removal works in `/scans`.
- Current Issues are grouped, sorted, and export/share behavior works.
- Mobile header, credit pack modal, and report hero layout are usable.
- AI tips are not triggered automatically by Deep Site Scan.

## Known Limitations

- Public scan rate limiting is in-memory per API instance, not shared across Cloud Run instances.
- Dodo webhook trust boundaries need fixture-backed tests for amount, currency, environment, and status checks.
- Prod frontend deployment currently uses a combined AEO/Lab script; prefer an AEO-only prod path before frequent prod frontend deploys.
- Dev noindex behavior should eventually use an explicit public env flag instead of relying on host/API-base heuristics.
- GA4/GTM events are partial and need a launch analytics event map.
- Release checks currently rely on typecheck and DB tests; AEO web build should be added to the release gate.
