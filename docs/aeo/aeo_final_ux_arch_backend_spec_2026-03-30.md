# AEO/LAB Final UX + Architecture + Backend Spec

Date: 2026-03-30  
Status: Final for MVP launch alignment (`free-first`)  
Git anchor: functional base `b359096`, latest hardening/status `cf118be`

## 1) Purpose and source context

This document is the final product/UX/backend contract for AEO/LAB MVP0 so Claude/Codex can execute without manual interpretation.

Sources consolidated:
- `aeo_codex_v1_spec_v4.md`
- `aeo_codex_v1_spec (1).md`
- `aeo_codex_v1_spec_v3_addendum.md`
- `MOADS_STACK_CURRENT_SPEC.md`
- `moads_full_architecture_for_codex (1) (1).md`
- current repository state at `cf118be` + `b359096`

If any old text conflicts with this file, this file wins for MVP0 execution.

## 2) Locked product decisions

### 2.1 Pricing layers (must not be mixed)

There are two separate economic entities:

1. Product plans (subscription access):
- `Free`
- `Starter` (monthly access)
- `Pro` (coming soon, lead capture only now)
- `Deep Audit` (agency lead flow only now)

2. Credit packs (prepaid usage bundles):
- `Pack S` -> `$4.99` -> `30 credits`
- `Pack M` -> `$9.99` -> `80 credits`
- `Pack L` -> `$19.99` -> `200 credits`

Rules:
- Do not name packs as `Starter`/`Pro`.
- `1 credit = 1 AI tips generation`.
- Welcome gift for first AEO activation: `1 credit` (idempotent grant).

### 2.2 Launch model

- Launch mode is `Free + Credits` (not strict-free).
- Public deterministic scan is always free.
- Auth unlock opens detailed report and paid AI tips action.
- Share/print is in MVP.
- Global ranking is deferred to next iteration.

## 3) Final UX contract

### 3.1 `/aeo` landing (checker entry)

Must be minimal and lead-oriented, based on `moads.agency` visual language.

Required changes:
- Remove wording fragment: `for e-commerce` in hero eyebrow.
- Keep only one input in scan form: `Store URL`.
- Remove optional fields from landing form:
  - `Brand Name`
  - `Category`
  - `Work Email`
  - `Platform`

Expected copy behavior:
- Before input: `No credit card. Deterministic score in under 60 seconds.`
- With URL input: `Score is free. Full breakdown unlocks after sign-in.`

Typography:
- Use Coolvetica only for hero/score headings.
- Keep body/UI typography readable and lightweight.

### 3.2 Public result `/aeo/r/{publicToken}`

Public report must show:
- `AI Discovery Score` (0-100).
- evidence summary (structured data + on-page evidence).
- top fixes preview.
- lock panel for full recommendations.
- actions: `Print` and `Share`.

Lock behavior:
- Score is public.
- Extended recommendations and advanced blocks are locked until auth/claim.

### 3.3 Auth + claim flow

Flow:
1. User clicks unlock CTA.
2. User signs in via shared Firebase Auth.
3. Backend creates `.moads.agency` session via `/v1/auth/session-login`.
4. User claims scan via `/v1/aeo/scans/:scanId/claim`.
5. Same report becomes unlocked for account context.

### 3.4 Auth dashboard `/aeo/dashboard`

Show:
- account identity basics,
- credits widget (from backend wallet summary),
- scan history,
- explicit AI tips action (1 credit),
- evidence widgets area (GA4/realtime as connected layer).

Required CTA for growth instrumentation:
- `Refine your AI score and track growth in real time`.

### 3.5 Pricing and lead funnel

In AEO/LAB UX:
- `Free` is active.
- `Starter` is available as monthly access.
- `Pro` and `Deep Audit` use waitlist/lead forms (no fake activation).
- Always separate plans from credit packs in copy and UI blocks.

### 3.6 Unsupported/problematic targets

For problematic scans, show explicit state:
- `blocked` (WAF/challenge/forbidden),
- `js_heavy` (client-rendered risk),
- `marketplace_unsupported`.

Mandatory CTA text:
- `Sign up to get update` for unsupported marketplace/site classes.

## 4) Score engine contract (shared for all plans)

Main rule: one deterministic, objective, server-side score for everyone.

### 4.1 Formula stability

- Score algorithm is identical across `Free`, `Starter`, and future plans.
- No randomness.
- Same page content -> same score.
- Every deduction maps to a visible issue.

### 4.2 Dimension mapping for v1

User-facing dimensions:
- `Access` (35)
- `Understanding` (35)
- `Citation readiness` (30)

Implementation mapping in current engine:
- `access` -> Access
- `basic_seo` -> Understanding
- `ratings_schema` -> Citation readiness

### 4.3 What must not change score

These are external evidence layers and must not mutate core score:
- GA4 data,
- Search Console evidence,
- realtime mention stream,
- OpenAI outputs,
- tracked query SERP/AI-overview monitoring.

## 5) Evidence layer (connected, optional)

Evidence widgets are allowed and encouraged, but marked separately:
- label examples:
  - `Connected data`
  - `Evidence layer`
  - `Not included in AI Discovery Score`

Connection model:
- `mock` mode is default for safe testing.
- `live` mode only when secrets/connectors are configured.

## 6) Backend and security contract

### 6.1 Server-side authority

Must stay server-side only:
- scan execution and score computation,
- scan claim/unlock,
- wallet debit/grant/refund,
- OpenAI calls,
- manual fulfillment/admin actions,
- integration secrets.

### 6.2 Auth/session

- Shared Firebase identity provider.
- Shared session cookie on `.moads.agency`.
- Product access by membership + entitlement checks.

### 6.3 Wallet and credits

- Shared global wallet model.
- `wallet.ledger_entries` is source of truth.
- Frontend credits are display cache only.

### 6.4 API behavior contract

No new API families required in this doc lock. Existing namespace remains:
- `/v1/auth/*`
- `/v1/me`, `/v1/wallet/*`
- `/v1/aeo/*`
- `/v1/lab/*`

Contracted behaviors:
- `public scan` is free.
- `generate-ai-tips` is explicit action and charges exactly `1 credit`.
- plan and pack semantics never mixed in responses/copy.

## 7) Performance and platform constraints

- Keep scanner cheap by default (no mandatory headless render in MVP0).
- Use explicit warnings for in-app/native browser limitations where needed.
- Queue/adapter usage must avoid burst overload and hanging requests.
- Rate-limit public scan endpoints for abuse protection.

## 8) Deferred to next iteration

- Global opt-in public ranking board.
- Full marketplace-specific deep parsers.
- Full dedicated `moads-pro` contour activation (after secrets/access completion).
- Advanced monitored query intelligence in core product.

