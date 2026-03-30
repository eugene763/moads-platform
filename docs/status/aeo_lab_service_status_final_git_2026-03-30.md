# AEO/LAB Service Status (Git-Anchored)

Snapshot time: 2026-03-30 14:02:15 +0400  
Repository: `moads-platform`  
Status type: technical verification for Claude/Codex handoff

## 1) Git snapshot anchor

- `HEAD`: `cf118be`  
  `docs: add prod rollout status snapshot and harden frontend deploy check`
- Functional base for AEO/LAB MVP: `b359096`  
  `feat: finalize AEO/LAB pro contour MVP and frontend routing setup`

Interpretation rule for this status file:
- runtime behavior is anchored to these two commits plus live checks below.

## 2) Live runtime check (current)

Direct checks executed at snapshot time:
- `https://aeo.moads.agency/` -> `200`
- `https://lab.moads.agency/` -> `200`
- `POST https://api.moads.agency/v1/aeo/public-scans` -> `200`

Referenced rollout status source:
- `docs/status/prod-rollout-status-2026-03-30.md`

From rollout source (as-of 2026-03-30 13:18:44 +04):
- Firebase custom domains for `aeo.moads.agency` and `lab.moads.agency` are `OWNERSHIP_ACTIVE`, `HOST_ACTIVE`, `CERT_ACTIVE`.
- Cloud Run services updated:
  - `moads-aeo-web`
  - `moads-lab-web`
  - `moads-api`

## 3) API coverage in current code

Mounted route groups:
- `/v1/auth/*`
- `/v1/me`, `/v1/wallet/summary`
- `/v1/aeo/*`
- `/v1/lab/*`

### 3.1 `/v1/aeo` coverage

Implemented and active in code:
- public scan creation/report:
  - `POST /v1/aeo/public-scans`
  - `GET /v1/aeo/public-scans/:publicToken`
- public waitlist:
  - `POST /v1/aeo/waitlist`
- auth flow:
  - `POST /v1/aeo/scans/:scanId/claim`
  - `GET /v1/aeo/scans`
  - `GET /v1/aeo/scans/:scanId`
  - `POST /v1/aeo/scans/:scanId/generate-ai-tips`
- site management:
  - `GET /v1/aeo/sites`
  - `POST /v1/aeo/sites`
- offer/pricing/orders:
  - `GET /v1/aeo/offers/starter`
  - `POST /v1/aeo/offers/starter/consume`
  - `GET /v1/aeo/pricing/credit-packs`
  - `GET /v1/aeo/orders`
  - `POST /v1/aeo/orders/checkout`
  - `POST /v1/aeo/orders/:orderId/manual-fulfill` (admin)
- evidence:
  - `GET /v1/aeo/evidence/ga4`
  - `GET /v1/aeo/realtime/stream` (SSE)

### 3.2 `/v1/lab` coverage

- `GET /v1/lab/center`
- `GET /v1/lab/orders`
- `POST /v1/lab/starter/checkout`
- `POST /v1/lab/admin/orders/:orderId/manual-fulfill` (admin)

### 3.3 Auth/wallet/me coverage

- `POST /v1/auth/session-login`
- `POST /v1/auth/session-logout`
- `GET /v1/auth/me`
- `GET /v1/me`
- `GET /v1/me/products`
- `GET /v1/wallet/summary`

## 4) Done vs deferred status

## Done now
- AEO and LAB Next.js apps are present and deployed through pro frontend scripts.
- Public AEO scan/report token flow is active.
- Auth claim and unlock flow is active.
- AI tips endpoint with credit charging path is active.
- Shared auth/account/membership/wallet backend integration is active.
- API gateway path model for pro namespace is scripted and documented.

## Deferred / next iteration
- Global ranking board and opt-in shared leaderboard.
- Advanced marketplace-specific parsers/connectors.
- Full production move to dedicated `moads-pro` contour with all secrets/access finalized.
- Full automated subscription/webhook hardening beyond manual-safe fulfillment baseline.

## 5) Current blockers and risks

Primary contour risk remains dedicated pro project readiness:
- missing/blocked access for `moads-pro` project,
- required secrets missing in pro context:
  - `SESSION_COOKIE_SECRET_PRO`
  - `MOADS_API_PRO_DATABASE_URL`
- managed pro DB sync and pro API deploy cannot complete until permissions/secrets are fixed.

Operational note:
- additional pro gateway LB resources were created in current project; final placement decision is still required.

## 6) Practical interpretation for implementers

Use this as the current truth:
- service is live on `aeo.moads.agency` and `lab.moads.agency` in current project contour,
- API contracts listed above are available,
- product work can continue immediately in repo,
- migration to dedicated `moads-pro` should be treated as an infrastructure phase gate, not as a blocker for UX/backend iteration.

