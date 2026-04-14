# AEO/LAB Final Spec (Launch Baseline)

Date: 2026-04-14  
Status: Current launch baseline for the live AEO/LAB contour  
Repository: `moads-platform`  
Branch: `feature/motrend-wallet-fastspring`  
Current git anchor: `ac04f69`  
Key stabilization commits:
- `054b4bb` — day-1 scan/dashboard stabilization
- `99c4035` — free pricing CTA routes to checker anchor
- `d184e17` — hardened product-page sampling in scanner
- `748e531` — canonical final launch handoff doc added
- `ac04f69` — current branch head after latest status/doc alignment

## 1) Objective

Ship a launchable AEO MVP that:
- gives any public URL a deterministic page-readiness score,
- unlocks deeper report and account surfaces after sign-in/claim,
- monetizes optional AI tips via prepaid credit packs,
- drives agency leads through the main MO ADS form,
- stays cheap, explainable, and mostly server-side.

## 2) Product model (locked)

Two economic layers must remain separate.

### 2.1 Access / plans
- `Free` — live now
- `Starter` — coming soon
- `Pro` — coming soon
- `Store` — coming soon
- `Deep Audit` — live as lead form only

### 2.2 Credit packs
- `Pack S` = 30 credits = `$4.99`
- `Pack M` = 80 credits = `$9.99`
- `Pack L` = 200 credits = `$19.99`

Rules:
- `1 credit = 1 AI tips generation`
- public scan is always free
- packs must never be described as subscriptions
- plans and packs must never be mixed in copy or billing logic

### 2.3 Active payment provider
- Dodo Payments is the only active payment provider for AEO credit packs
- active Dodo product ids:
  - `Pack S` -> `pdt_0NcVKMKum3pnZI0k9W9GP`
  - `Pack M` -> `pdt_0NcVKTv8PCbSE5KplPmSI`
  - `Pack L` -> `pdt_0NcVKZ0msSsA9QJ8ZVzH6`
- webhook endpoint:
  - `POST /v1/billing/webhooks/dodo`

## 3) UX contract (current)

### 3.1 AEO landing (`/`)
- single required field: `Store URL`
- top nav CTA: `Open Checker`
- nav CTA points to `/#scan`
- free pricing CTA also points to `/#scan`
- copy reflects the real score model:
  - `Free score`
  - `Scored now: 3 blocks`
  - `Evidence layer included`

Removed on purpose:
- `Brand Name`
- `Category`
- `Work Email`
- `Platform`
- misleading hero phrase fragments that over-segment the entry form

### 3.2 Public report (`/r/{publicToken}`)

Public report shows:
- public score,
- scored-now breakdown,
- evidence layer,
- top fixes,
- action plan,
- prompt kit,
- lock states for deeper account-only areas.

Required copy alignment:
- score is deterministic and page-based,
- evidence layer is broader than the top-line score,
- AI tips are optional post-scan actions and not part of the score.

### 3.3 Auth + claim
1. user signs in with shared Firebase auth
2. server issues session cookie
3. scan can be claimed to the account
4. account surfaces unlock: history, wallet, AI tips, connected evidence

### 3.4 Dashboard (`/dashboard`)

Launch-mode dashboard behavior:
- free users can sign in and access dashboard surfaces
- no active membership is required for basic AEO dashboard access
- missing session shows only sign-in gate
- dashboard copy should not show product-membership errors for free users

### 3.5 LAB (`lab.moads.agency`)
- billing/account center
- live focus: packs, wallet, order history
- `Starter / Pro / Store` remain coming soon
- agency CTA stays on the main MO ADS lead form

## 4) How scanning works right now

Core scanner:
- raw HTML fetch only
- no mandatory headless browser
- no OpenAI in public scan
- no paid provider data in public scan

Primary read path:
1. normalize URL
2. fetch requested URL with browser-like headers
3. one controlled retry on retryable/network-like failure
4. parse:
   - title
   - meta description
   - canonical
   - og/twitter title
   - JSON-LD
   - AggregateRating
   - visible review/rating evidence

Evidence-first additions now live:
- `robots.txt`
- `sitemap.xml`
- AI bot crawlability:
  - `GPTBot`
  - `ClaudeBot`
  - `Google-Extended`
  - `PerplexityBot`
- secondary product-page sampling when the requested URL is homepage/root
- action plan block
- manual prompt kit

Current limitation:
- JS-heavy pages still rely on raw HTML snapshot only
- product-page enrichment is honest but intentionally conservative

## 5) Score engine contract

Top-line score is deterministic, rules-based, and shared across all users.

### 5.1 Scored now
- `Access`
- `Basic SEO`
- `Ratings Schema`

Current internal weighted blocks:
- `access`
- `basic_seo`
- `ratings_schema`

### 5.2 Evidence layer

These enrich the report but do not mutate the core score:
- crawlability
- product-page sample
- action plan
- prompt kit
- connected evidence widgets
- OpenAI output

### 5.3 What score does not use
- OpenAI
- GA4
- realtime stream
- Perplexity
- SERP APIs
- headless render

## 6) Backend and API contract

Key active namespaces:
- `/v1/auth/*`
- `/v1/me`
- `/v1/wallet/*`
- `/v1/aeo/*`
- `/v1/lab/*`
- `/v1/billing/webhooks/dodo`

Critical AEO routes:
- `POST /v1/aeo/public-scans`
- `GET /v1/aeo/public-scans/:publicToken`
- `POST /v1/aeo/scans/:scanId/claim`
- `POST /v1/aeo/scans/:scanId/generate-ai-tips`
- `GET /v1/aeo/scans`
- `GET /v1/aeo/scans/:scanId`

Critical LAB routes:
- `GET /v1/lab/center`
- order and wallet/account surfaces used by LAB UI

## 7) Security rules

- secrets stay server-side only
- session cookie is scoped to `.moads.agency`
- wallet ledger is the financial source of truth
- scoring, claim, charging, webhook processing, and AI calls are server-side only

Relevant secrets:
- `DODO_API_KEY`
- `DODO_WEBHOOK_KEY`
- `OPENAI_API_KEY`

## 8) OpenAI status

OpenAI is not part of public scan.

Current role:
- optional AI tips after scan
- explicit user action only
- charged by credits

Prompt ownership:
- prompt stays in backend code for now
- no dashboard-side prompt product is required in OpenAI

## 9) Runtime status (last verified)

Last verified live revisions:
- `moads-api` -> `moads-api-00034-h54`
- `moads-aeo-web` -> `moads-aeo-web-00010-fn6`
- `moads-lab-web` -> `moads-lab-web-00009-2mr`

Operational note:
- branch HEAD is newer than the last verified runtime snapshot,
- latest post-runtime commits are documentation/status changes,
- frontend redeploy may require renewed `gcloud` auth before the next publish.

Endpoint checks:
- `https://aeo.moads.agency/` -> `200`
- `https://lab.moads.agency/` -> `200`
- `POST https://api.moads.agency/v1/aeo/public-scans` -> working

## 10) Acceptance criteria

Launch baseline is acceptable when:
1. landing CTAs route to the checker, not to dead/self routes
2. public scan creates a report token and opens report successfully
3. free signed-in users can access dashboard without membership error
4. report clearly separates score from evidence layer
5. Dodo pack mapping is active for AEO
6. public scan makes no paid provider calls

## 11) Deferred

- headless fallback for JS-heavy sites
- deeper PDP discovery
- broader content-structure scoring
- recurring subscriptions
- live monitored intelligence beyond optional evidence layers
