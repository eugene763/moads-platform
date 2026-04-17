# MoTrend Beta v1 Status

Last updated: 2026-04-15 (Asia/Tbilisi)

## Scope

This note freezes the currently usable MoTrend stack as the working **Beta v1** snapshot.

## Repos and anchors

### Frontend
- Repo: `/Users/malevich/Documents/Playground/motrend`
- Branch: `feature/motrend-wallet-fastspring`
- Snapshot anchor at freeze start: `f83c45486708a3e7a14f8ca7c683256252f3bda8`

### Backend
- Repo: `/Users/malevich/Documents/Playground/moads-platform`
- Branch: `feature/motrend-wallet-fastspring`
- Current backend anchor: `844b6de7563907ad202519bc21b79bcb4be3f762`

## Runtime

- Main site: [https://trend.moads.agency](https://trend.moads.agency)
- API: [https://api.moads.agency](https://api.moads.agency)
- Health: [https://api.moads.agency/health](https://api.moads.agency/health)
- Public share route: `https://trend.moads.agency/v/<slug>`
- Save/watch fallback route: `https://trend.moads.agency/save-video.html?...`

## Active product behaviors

### Authentication
- Failed auth attempts reopen the auth panel
- Returning browsers are biased toward `Log in`
- New account creation is still allowed on previously used browsers
- Free signup gift is `3` credits
- Repeat gift abuse is suppressed with browser markers plus server-side fingerprint cooldown

### Billing
- Active provider: `Dodo Payments`
- Wallet uses:
  - `GET /billing/credit-packs`
  - `GET /billing/orders`
  - `POST /billing/orders/checkout`
  - `POST /billing/webhooks/dodo`
- Pack set:
  - Starter `30`
  - Creator `80`
  - Pro `200`
- Runtime mode: `DODO_ENVIRONMENT=live_mode`
- Current live API revision: `moads-api-00036-fgz`

### Safe QA contour
- Frontend QA should run on Firebase Hosting preview URLs or other `*.web.app` / `*.firebaseapp.com` hosts, not on `trend.moads.agency`
- Those Firebase QA hosts should resolve to `https://api-dev.moads.agency`
- `api-dev` should stay on dev Cloud SQL and `DODO_ENVIRONMENT=test_mode`
- MoTrend credit packs in dev-cloud should use Dodo test product IDs before checkout QA starts

### Sharing and downloads
- Canonical user-facing share links should use `/v/<slug>`
- `save-video.html` remains the direct/open-safe fallback
- Expired prepared artifacts should recover through `Prepare download`

## Runtime mode note

The production contour has been restored to Dodo `live_mode`. Test-mode checkout remains available only for future explicit QA runs when prod/runtime is intentionally switched back.

## Known beta constraints

1. Dodo may still require tax-related country/address fields even in minimal checkout mode.
2. iPhone/Safari preview behavior is still the main remaining UX risk when no persisted generated preview is already available.
3. The secondary local clone `/Users/malevich/motrend` is documentation/reference only and is not the canonical implementation source.
