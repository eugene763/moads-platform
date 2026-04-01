# AEO/LAB Final Spec (MVP0)

Date: 2026-03-30 16:39 +0400  
Status: Final launch spec for current contour (`free-first`)  
Repository: `moads-platform`  
Final git anchor: `308171c`  
Functional base: `b359096`

## 1) Objective

Ship an MVP that:
- gives a public deterministic AEO score for any URL,
- unlocks extended report after auth/claim,
- monetizes explicit AI tips by credits,
- drives agency leads through the main site form,
- stays secure and cheap to run.

This spec is decision-complete for current implementation and rollout in the active project contour.

## 2) Product model (locked)

Two economic layers must stay separate.

### 2.1 Plans (subscriptions / access)
- `Free`
- `Starter` (coming soon, monthly access layer)
- `Pro` (coming soon, waitlist)
- `Store` (coming soon, monitored store layer)
- `Deep Audit` (lead form flow)

### 2.2 Credit packs (usage bundles)
- `Pack S` = 30 credits = $4.99
- `Pack M` = 80 credits = $9.99
- `Pack L` = 200 credits = $19.99

Rules:
- do not label packs as `Starter`/`Pro`,
- `1 credit = 1 AI tips generation`,
- public scan is always free,
- AI tips are always explicit user action and paid by credit.

### 2.3 Creem launch phase
- current live billing mode: `Free + Packs only`,
- `Pack S / M / L` are one-time Creem purchases,
- `Starter / Pro / Store` are not purchasable in this launch phase,
- recurring subscriptions are intentionally deferred.

## 3) UX contract (implemented baseline)

## 3.1 AEO landing (`/`)
- white background, minimal layout,
- typography: `Coolvetica` family,
- logo in header (`/logo-moads.svg`),
- primary form: only `Store URL` field.

Removed on purpose:
- `Brand Name (optional)`,
- `Category (optional)`,
- `Work Email (optional)`,
- `Platform (optional)`,
- eyebrow fragment `for e-commerce`.

Lead generation:
- section with CTA to `https://moads.agency/footer#form`,
- text focused on implementation help by agency team.

## 3.2 Public report (`/r/{publicToken}`)
- public score visible,
- evidence visible (structured/on-page summary),
- top fixes preview,
- lock panel for full breakdown,
- `Print` and `Share` actions,
- lead CTA to main MO ADS form.

## 3.3 Auth + claim flow
1. user clicks unlock,
2. Firebase auth sign-in,
3. `/v1/auth/session-login` creates server session cookie,
4. `/v1/aeo/scans/:scanId/claim` binds scan to account,
5. recommendations and account flows unlock.

## 3.4 Dashboard (`/dashboard`)
- account + wallet snapshot,
- scan history,
- explicit AI tips action (1 credit),
- evidence widgets area (GA4/realtime),
- lead CTA to main MO ADS form.

## 3.5 LAB (`lab.moads.agency`)
- account/billing center for AEO stack,
- logo + white background + Coolvetica,
- live purchase surface for `Pack S / M / L`,
- `Starter / Pro / Store` shown as upcoming access layers, not live checkout,
- lead CTA to `https://moads.agency/footer#form`.

## 4) Score engine contract (stable)

Main score:
- deterministic,
- objective,
- same algorithm for all users/plans,
- server-side only,
- explainable deductions only.

Dimensions (v1 mapping):
- `Access` (35),
- `Understanding` (35),
- `Citation readiness` (30).

Current internal implementation dimensions:
- `access`,
- `basic_seo`,
- `ratings_schema`.

Must not affect core score:
- GA4 stats,
- realtime stream,
- GSC / external connector data,
- OpenAI output.

## 5) Backend and API contract (current)

No new API family required in this spec. Active namespaces:
- `/v1/auth/*`
- `/v1/me`, `/v1/wallet/summary`
- `/v1/aeo/*`
- `/v1/lab/*`

Critical AEO routes in scope:
- `POST /v1/aeo/public-scans`
- `GET /v1/aeo/public-scans/:publicToken`
- `POST /v1/aeo/waitlist`
- `POST /v1/aeo/scans/:scanId/claim`
- `POST /v1/aeo/scans/:scanId/generate-ai-tips`
- `GET /v1/aeo/realtime/stream`
- `GET /v1/aeo/evidence/ga4`

Critical LAB routes in scope:
- `GET /v1/lab/center`
- `POST /v1/lab/starter/checkout`
- manual fulfill admin route.

Billing provider:
- Creem is the target active provider for AEO credit packs in this phase.
- Canonical webhook endpoint: `POST /v1/billing/webhooks/creem`

## 6) Security and data rules

- secrets only server-side (Secret Manager / env, not frontend),
- Creem credentials live only in:
  - `CREEM_API_KEY`
  - `CREEM_WEBHOOK_SECRET`
  - `CREEM_API_BASE_URL` (optional override)
- session cookie scoped to `.moads.agency`,
- wallet ledger is source of truth,
- frontend wallet values are display cache only,
- key actions server-side only:
  - scoring,
  - claim,
  - debit/grant/refund,
  - AI provider calls,
  - manual fulfillment.

## 7) Runtime and deployment status (as of this spec)

Active project contour: `gen-lang-client-0651837818`.

Live checks at spec timestamp:
- `https://aeo.moads.agency/` -> `200`
- `https://lab.moads.agency/` -> `200`
- `POST https://api.moads.agency/v1/aeo/public-scans` -> `200`

Cloud Run latest ready revisions:
- `moads-aeo-web` -> `moads-aeo-web-00004-s9x`
- `moads-lab-web` -> `moads-lab-web-00004-rch`
- `moads-api` -> `moads-api-00012-n79`
- `moads-api-dev` -> `moads-api-dev-00009-j85`

## 8) Acceptance criteria

MVP is acceptable when all are true:
1. AEO landing has URL-only checker on white background with Coolvetica and logo.
2. Public report shows score and locked extended sections until auth.
3. Auth + claim flow unlocks account report correctly.
4. AI tips trigger only by explicit click and debit 1 credit.
5. Lead CTA to `https://moads.agency/footer#form` exists on AEO and LAB key pages.
6. Domains `aeo.moads.agency` and `lab.moads.agency` serve updated UI.
7. API remains stable under `/v1` contract above.
8. Creem packs can be wired without enabling Starter subscriptions.

## 9) Deferred scope (next iteration)

- global public ranking board (opt-in),
- deeper marketplace-specific parsing adapters,
- recurring subscriptions for `Starter / Pro / Store`,
- full isolated `moads-pro` infra rollout after secrets/access completion,
- advanced monitored query intelligence as separate evidence modules.

## 10) Canonical companion docs

- `docs/aeo/aeo_final_ux_arch_backend_spec_2026-03-30.md`
- `docs/aeo/aeo_codex_block_prompts_final_2026-03-30.md`
- `docs/billing/aeo-creem-cutover.md`
- `docs/status/aeo_lab_service_status_final_git_2026-03-30.md`
- `docs/status/prod-rollout-status-2026-03-30.md`
