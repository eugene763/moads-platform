# MoTrend Beta v1 Status

Last updated: 2026-04-14 (Europe/Madrid)

## Scope

This note freezes the currently usable MoTrend stack as the working **Beta v1** snapshot.

## Repos and anchors

### Frontend
- Repo: `/Users/malevich/Documents/Playground/motrend`
- Branch: `feature/motrend-wallet-fastspring`
- Snapshot anchor at freeze start: `b4bb9b1b3b6a7a097457dfb54f98c7a57ca49ec6`

### Backend
- Repo: `/Users/malevich/Documents/Playground/moads-platform`
- Branch: `feature/motrend-wallet-fastspring`
- Current backend anchor: `73c12443f33fb153714c8442a546751fe8004160`

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

### Sharing and downloads
- Canonical user-facing share links should use `/v/<slug>`
- `save-video.html` remains the direct/open-safe fallback
- Expired prepared artifacts should recover through `Prepare download`

## QA mode note

For current beta QA, the production contour has been exercised with Dodo `test_mode` so checkout flow can be validated without real charges.

## Known beta constraints

1. Dodo may still require tax-related country/address fields even in minimal checkout mode.
2. iPhone/Safari preview behavior is still the main remaining UX risk when no persisted generated preview is already available.
3. The secondary local clone `/Users/malevich/motrend` is documentation/reference only and is not the canonical implementation source.
