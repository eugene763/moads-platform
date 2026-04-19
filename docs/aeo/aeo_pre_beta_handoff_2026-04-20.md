# MO ADS AEO/LAB Pre-Beta Handoff

Date: 2026-04-20  
Timezone: Asia/Tbilisi  
Repository: `moads-platform`  
Current branch: `codex/fix-reference-video-duration-u5ad86df2c2`  
Code anchor before this documentation pass: `b73fee9`  
Product state: **pre-beta / launch stabilization**

This document is the canonical handoff for another LLM or engineer to review the current AEO/LAB MVP, identify gaps, and propose safe next iterations without relying on prior chat context.

## 1. Executive Summary

AEO/LAB is a pre-beta implementation of the MO ADS AI Discovery Score flow.

The current product model is intentionally narrow:

- Public AEO scan is free.
- The first user input is only a site URL.
- The top-line score is deterministic and rules-based.
- OpenAI is not used during public scanning.
- External paid data providers are not used during public scanning.
- Credit packs are the live monetization path.
- Subscription-style plans are not live in this phase.
- LAB is the account/billing center.

The core philosophy is:

> Use an objective, repeatable page-readiness score as the wedge, then layer optional AI tips, billing, GA/realtime evidence, and agency services around it.

The product should not imply that it has already measured actual visibility in ChatGPT, Gemini, Claude, Perplexity, Grok, or DeepSeek unless a future provider-backed module has been implemented and explicitly separated from the deterministic score.

## 2. Current Git / Runtime Interpretation

### Source branch

Current working branch:

```text
codex/fix-reference-video-duration-u5ad86df2c2
```

Current code anchor before docs:

```text
b73fee9 fix: parse canonical link tags in aeo scanner
```

Recent relevant AEO/backend commits in the ancestor chain include:

- `b73fee9` — parse canonical `<link rel="canonical" href="...">` correctly.
- `d184e17` — harden AEO product page sampling.
- `99c4035` — route free pricing CTA to checker anchor.
- `054b4bb` — stabilize AEO day-1 scan and dashboard flow.
- `f50c18f` — set Dodo product IDs for AEO credit packs.

### Live runtime caution

The source branch and public runtime can differ until a fresh full deploy is run. Treat this document as the **source-of-truth source-code handoff**, not as proof that every source change is live in production.

Known previously verified live endpoints:

- `https://aeo.moads.agency/`
- `https://lab.moads.agency/`
- `https://api.moads.agency/v1/aeo/public-scans`

Known previously verified API revision from older status docs:

```text
moads-api-00034-h54
```

Known previously verified frontend revisions from older status docs:

```text
moads-aeo-web-00010-fn6
moads-lab-web-00009-2mr
```

If this handoff is used for production QA, first run fresh deploy/status verification rather than assuming those historical revisions are still current.

## 3. Product Model

### Live now

#### Free

Free includes:

- URL-only public scan.
- Public score page.
- Shareable report URL.
- Basic evidence and issues.
- Auth/claim path for saving report and unlocking deeper account surfaces.

Free does not require:

- Credit card.
- Subscription.
- OpenAI call.
- GA4 connection.

#### Credit Packs

Credit packs are one-time purchases. They are not subscriptions.

Current AEO packs:

| Pack | Code | Credits | Price | Dodo Product ID |
|---|---:|---:|---:|---|
| Pack S | `aeo_pack_s` | 30 | `$4.99` | `pdt_0NcVKMKum3pnZI0k9W9GP` |
| Pack M | `aeo_pack_m` | 80 | `$9.99` | `pdt_0NcVKTv8PCbSE5KplPmSI` |
| Pack L | `aeo_pack_l` | 200 | `$19.99` | `pdt_0NcVKZ0msSsA9QJ8ZVzH6` |

Credit rule:

```text
1 credit = 1 AI tips generation
```

#### Deep Audit

Deep Audit is lead-based through the MO ADS agency form. It is not an automated subscription or checkout path in the current AEO MVP.

Lead URL:

```text
https://moads.agency/footer#form
```

### Coming soon / not live

The following are roadmap/lead states, not live recurring billing products:

- Starter monitoring plan.
- Pro monitoring plan.
- Store monitoring plan.
- Continuous AI engine monitoring.
- Competitor intelligence.
- Marketplace deep readiness.
- Provider-backed AI visibility checks.

## 4. Frontend Surfaces

### 4.1 AEO Landing

Path:

```text
apps/aeo-web/app/page.tsx
```

Primary behavior:

- Shows the public checker landing page.
- Uses `AeoTopNav`.
- Uses `ScanForm`.
- Provides anchor target `#scan` for checker entry.
- Pricing `Free` CTA should route to `/#scan`.
- Credit pack CTA routes to LAB billing center.
- Agency/Deep Audit CTA routes to `https://moads.agency/footer#form`.

Current scan input behavior:

- Only one required field: site URL.
- The frontend submits `siteUrl` to `/v1/aeo/public-scans`.
- Backend can normalize bare domains by adding `https://`.

UX caveat:

- If the frontend input remains `type="url"`, browsers may reject `example.com` before backend normalization. For free-first conversion, prefer `type="text"` plus helper copy such as `example.com or https://example.com`.

Current landing content must stay aligned with the actual scanner:

- Do say: deterministic page-readiness score.
- Do say: raw HTML evidence.
- Do say: scored now by Access, Basic SEO, Ratings Schema.
- Do say: crawlability/product-page/prompt kit are evidence layer.
- Do not say: measured live visibility across ChatGPT/Gemini/Claude/etc. unless future provider modules are active and clearly separated.

### 4.2 AEO Top Navigation

Path:

```text
apps/aeo-web/components/aeo-top-nav.tsx
```

Expected behavior:

- Brand link routes to `/`.
- `How It Works` routes to `/#how-it-works`.
- `Dimensions` routes to `/#dimensions`.
- `Pricing` routes to `/#pricing`.
- `Agency` routes to the MO ADS agency form.
- `Log In` routes to `/dashboard`.
- Primary nav CTA should be `Open Checker`, not `Get Free Score`, to avoid implying it triggers scanning from non-form pages.
- `Open Checker` should route to `/#scan`.

### 4.3 AEO Scan Form

Path:

```text
apps/aeo-web/components/scan-form.tsx
```

Behavior:

1. Captures `siteUrl`.
2. Tracks GA4 event `aeo_scan_submit` when available.
3. Calls API:

```http
POST /v1/aeo/public-scans
Content-Type: application/json

{
  "siteUrl": "https://example.com"
}
```

4. Receives response with:

```json
{
  "scanId": "...",
  "publicToken": "...",
  "resultUrl": "/aeo/r/...",
  "cached": false,
  "status": "completed"
}
```

5. Redirects user to:

```text
/r/:publicToken
```

Important:

- Public scan must not call OpenAI.
- Public scan must not require auth.
- Public scan must not require billing.

### 4.4 Public Report

Path:

```text
apps/aeo-web/app/r/[publicToken]/page.tsx
apps/aeo-web/components/report-view.tsx
```

Behavior:

- Fetches report by public token:

```http
GET /v1/aeo/public-scans/:publicToken
```

- Displays public score.
- Displays score explanation.
- Displays evidence layer.
- Displays current issues.
- Displays prompt kit.
- Allows print/copy link.
- Offers sign-in/claim path.
- Offers AI tips generation only through explicit user action.

Report should label score correctly:

```text
Scored now: Access, Basic SEO, Ratings Schema
Evidence layer: Crawlability, product page sample, action plan, prompt kit
```

### 4.5 AEO Dashboard

Path:

```text
apps/aeo-web/app/dashboard/page.tsx
apps/aeo-web/components/dashboard-view.tsx
```

Behavior:

- If no session: show sign-in gate.
- After sign-in: load `/v1/me`, `/v1/wallet/summary`, `/v1/aeo/scans`.
- Show account email/account id.
- Show wallet balance.
- Show scan history.
- Show connected evidence widgets as `Not in score`.
- AI tips remain a credit-based action.

Current intended launch behavior:

- Free users should be allowed to access baseline dashboard after sign-in.
- Membership-style error copy such as `Active membership required for aeo` should not be surfaced to users as the primary dashboard state.

### 4.6 LAB Home and Center

Paths:

```text
apps/lab-web/app/page.tsx
apps/lab-web/app/center/page.tsx
apps/lab-web/components/center-view.tsx
```

LAB behavior:

- Account/billing surface.
- Shows wallet balance.
- Shows credit packs.
- Shows order history when available.
- Links back to AEO.
- Subscription plans remain coming soon / lead-based.

## 5. Backend API Surface

Base public domain:

```text
https://api.moads.agency
```

### AEO public endpoints

#### Create public scan

```http
POST /v1/aeo/public-scans
```

Body:

```json
{
  "siteUrl": "https://example.com",
  "anonymousSessionId": "optional"
}
```

Deprecated/optional legacy body fields may be accepted but should not be required in the UI:

- `brandName`
- `category`
- `workEmail`

Behavior:

- Rate-limited per IP bucket.
- Normalizes URL.
- Uses 24h cache by normalized URL.
- Runs deterministic scanner if no cache hit.
- Stores `aeo.scans` and `aeo.scan_reports`.
- Returns public token.

#### Read public scan

```http
GET /v1/aeo/public-scans/:publicToken
```

Returns:

- score.
- report summary.
- recommendations.
- issues.
- evidence.
- availability of credit packs.
- locked/unlocked state.

### AEO authenticated endpoints

All require session cookie.

```http
POST /v1/aeo/scans/:scanId/claim
GET  /v1/aeo/scans
GET  /v1/aeo/scans/:scanId
POST /v1/aeo/scans/:scanId/generate-ai-tips
GET  /v1/aeo/sites
POST /v1/aeo/sites
GET  /v1/aeo/offers/starter
POST /v1/aeo/offers/starter/consume
GET  /v1/aeo/pricing/credit-packs
GET  /v1/aeo/orders
POST /v1/aeo/orders/checkout
GET  /v1/aeo/evidence/ga4
GET  /v1/aeo/realtime/stream
```

### Auth/session endpoints

```http
POST /v1/auth/session-login
GET  /v1/me
GET  /v1/wallet/summary
```

AEO frontend calls session login with:

```json
{
  "idToken": "firebase-id-token",
  "productCode": "aeo"
}
```

### Billing endpoints

Dodo webhook:

```http
POST /v1/billing/webhooks/dodo
```

Expected event:

```text
payment.succeeded
```

## 6. Scanner Technical Spec

Implementation:

```text
services/api/src/lib/aeo-scanner.ts
```

### 6.1 URL normalization

Function:

```ts
normalizeSiteUrl(input: string)
```

Behavior:

- Trims input.
- Adds `https://` if no protocol exists.
- Allows only `http:` and `https:`.
- Removes hash.
- Lowercases hostname.
- Removes trailing slash except root.

Examples:

```text
Example.com/product-1/ -> requestedUrl https://example.com/product-1/; normalizedUrl https://example.com/product-1
```

### 6.2 Fetch layer

Current fetch behavior:

- Raw server-side HTTP fetch.
- No headless browser.
- No JavaScript rendering.
- Timeout: `12_000ms`.
- Browser-like desktop Chrome user agent.
- Accept language: `en-US,en;q=0.9`.
- One controlled retry for retryable/network-like failures.

Default user agent:

```text
Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36
```

Important limitation:

- If a site renders schema/reviews/canonical only after JavaScript hydration, the current scanner can miss it.
- If WAF blocks server-side fetches, the scanner can return blocked/low confidence.

### 6.3 Extracted facts

From the main HTML snapshot, scanner extracts:

- `<title>`
- `meta name="description"`
- `<link rel="canonical" href="...">`
- legacy/fallback meta-style canonical if present
- `og:title`
- `twitter:title`
- JSON-LD scripts
- Product / AggregateRating JSON-LD evidence
- visible rating/review snippets from stripped text

Canonical parser status:

- Fixed at `b73fee9`.
- The scanner now reads standard `<link rel="canonical" href="...">` tags.
- The previous bug parsed canonical as if it were a meta tag and produced false `canonical_missing` issues.

### 6.4 Crawlability evidence

Scanner attempts to gather:

- `robots.txt` reachability.
- sitemap URL hints.
- sitemap existence.
- sitemap candidate URLs.
- AI bot access rules for:
  - `GPTBot`
  - `ClaudeBot`
  - `Google-Extended`
  - `PerplexityBot`

This is evidence layer, not top-line score.

### 6.5 Product-page sample evidence

For root/homepage-like scans, scanner tries to identify one product-like URL.

Sources:

- internal homepage links.
- sitemap URLs.
- one level of nested sitemap index.

Hardening already implemented:

- Does not treat `sitemap-index.xml` as a product page.
- Filters technical URLs such as XML/JSON/TXT/feed/manifest/API documents.
- Checks candidate content-type for HTML.
- Returns `productPage: none` when no valid candidate exists.

Current limitation:

- PDP discovery is still conservative.
- It can miss product pages on heavily localized, JS-heavy, or complex ecommerce sites.

## 7. Score Model

Top-line score is deterministic and rules-based.

Current dimensions:

```ts
type ScoreDimension = "access" | "basic_seo" | "ratings_schema";
```

### 7.1 Access: up to 30 points

Rules:

- HTTP `200-299`: 30 points.
- HTTP `300-399`: 24 points.
- HTTP `400-499`: 8 points.
- network/blocked/other failure: lower/no access score depending result.

### 7.2 Basic SEO: up to 30 points

Rules:

- title present: +8.
- meta description present: +8.
- canonical present: +7.
- `og:title` or `twitter:title` present: +7.

Canonical is now parsed from standard link tags.

### 7.3 Ratings Schema: up to 40 points

Rules:

- AggregateRating found: +15.
- reviewCount or ratingCount found: +10.
- ratingValue is present and valid in scale: +8.
- visible rating/review evidence exists on page: +4.
- structured rating roughly matches visible evidence: +3.

### 7.4 Confidence

Confidence reflects fetch/parsing quality:

- high: clean evidence and strong page readability.
- medium: normal scan with partial evidence.
- low: blocked, thin raw HTML, or likely JS-heavy/client-rendered page.

### 7.5 Evidence that does not affect top-line score today

- crawlability.
- robots/sitemap.
- AI bot rules.
- product-page sample.
- prompt kit.
- action plan.
- GA4/realtime widgets.
- OpenAI tips.

This separation is intentional. It protects the score from volatile external providers.

## 8. AI / OpenAI Behavior

OpenAI is **not used** in public scan.

OpenAI is intended only for:

```http
POST /v1/aeo/scans/:scanId/generate-ai-tips
```

Properties:

- explicit user action only.
- credit-based.
- does not mutate top-line score.
- can run in mock mode or live mode.

Config fields:

```text
AEO_AI_TIPS_MODE=mock|live
AEO_AI_TIPS_MODEL=gpt-5-mini
OPENAI_API_KEY=...
```

Recommended pre-beta default:

```text
AEO_AI_TIPS_MODE=mock
AEO_GA4_MODE=mock
AEO_REALTIME_MODE=mock
```

Do not create OpenAI assistants/GPTs/prompt objects for this phase. The prompt is backend-controlled in code.

## 9. Billing / Dodo Payments

Active provider:

```text
Dodo Payments
```

FastSpring is not part of the active AEO pack path.

AEO products live in code:

```text
packages/db/src/aeo-billing.ts
```

Default products:

```ts
aeo_pack_s -> pdt_0NcVKMKum3pnZI0k9W9GP
aeo_pack_m -> pdt_0NcVKTv8PCbSE5KplPmSI
aeo_pack_l -> pdt_0NcVKZ0msSsA9QJ8ZVzH6
```

Required secrets:

```text
DODO_API_KEY
DODO_WEBHOOK_SECRET or DODO_WEBHOOK_KEY depending runtime config branch
OPENAI_API_KEY only for live AI tips
```

Webhook:

```text
https://api.moads.agency/v1/billing/webhooks/dodo
```

Event:

```text
payment.succeeded
```

Important operational rule:

- Credit grants must be ledger-based and idempotent.
- Duplicate webhook delivery must not double-credit the wallet.

## 10. Database / Persistence

Prisma schemas include:

```text
identity
core
catalog
access
wallet
billing
economics
analytics
comms
audit
motrend
aeo
ugc
```

AEO-relevant tables/models include:

- `AeoScan`
- `AeoScanReport`
- `AeoScanClaim`
- `AeoSite`
- `AeoWaitlistRequest`
- `AeoGaConnection`
- `AeoMonitoringSnapshot`
- `AeoMonitoringEvent`
- `AeoPlanOffer`
- `AeoAccountOfferState`

Wallet/billing source of truth:

- wallet balance is derived from wallet ledger.
- credit purchases create/settle billing orders.
- AI tips debit credits through wallet ledger.

## 11. Security / Safety

Current safety rules:

- Public scan is server-side only.
- Public scan is rate-limited.
- Secrets must stay server-side.
- OpenAI key must never ship to frontend.
- Dodo API/webhook secrets must never ship to frontend.
- Firebase web config is public-safe but must be present for auth UX.
- Authenticated routes use session cookie.
- Billing fulfillment must be idempotent.

Recommended hardening still needed:

- SSRF hardening for URL scanning.
- Private IP / localhost blocking after DNS resolution.
- Stronger content-size cap and redirect cap.
- Dedicated webhook raw-body signature verification tests for Dodo.
- Structured event/audit records for payment lifecycle.

## 12. Known Issues / Gaps

### 12.1 Visual branch mismatch risk

There have been multiple rollback/feature branches. Some previously deployed frontend changes, such as real SVG logo usage, may not exist in the current source branch if a rollback branch is checked out.

Before visual QA, compare current source with live HTML and choose one canonical branch.

### 12.2 Landing copy may still overpromise

Some older copy says or implies multi-engine visibility measurement. Current pre-beta scanner does not perform live multi-engine checks.

Fix:

- Reword hero/sample cards toward deterministic readiness.
- Keep AI engine logos as marketing/context only, not measured output.

### 12.3 Frontend URL input may be too strict

If `ScanForm` uses `type="url"`, browser validation can reject `example.com`, even though backend accepts and normalizes it.

Fix:

- Use `type="text"`.
- Keep server-side validation.
- Add helper text.

### 12.4 Content Structure is evidence/roadmap, not weighted score

If UI presents content structure as measured, backend should either:

- implement heading/FAQ/answer-block extraction, or
- label it as roadmap/evidence only.

### 12.5 No JS rendering

Raw HTML misses:

- client-rendered canonical tags.
- client-rendered schema.
- review widgets.
- product data injected after hydration.

Recommended v2:

- headless fallback only for low-confidence pages.
- do not headless-render every public scan by default.

### 12.6 PDP discovery is conservative

The scanner avoids false positives but can miss product pages. Next improvement should rank candidate URLs by product/schema/trust evidence and parse more sitemap variants.

## 13. Recommended Next Work

### Day 0 / immediate QA fixes

1. Confirm canonical bug is fixed on target branch and deploy API.
2. Re-scan known page with canonical link.
3. Confirm `canonical_missing` no longer appears.
4. Confirm public scan still does not call OpenAI.
5. Confirm Dodo checkout route still creates valid sessions.

### Day 1 / UX correctness

1. Replace misleading multi-engine measured copy.
2. Change first input from `type="url"` to `type="text"`.
3. Ensure top nav CTA routes to `/#scan`.
4. Ensure dashboard free sign-in does not show membership-required copy.
5. Ensure real logo assets are present in current source branch if they are expected in live UI.

### Day 2-3 / scanner quality

1. Implement heading extraction:
   - `h1`
   - `h2/h3`
   - FAQ-like blocks
   - answer-like sections
2. Add trust/commerce evidence:
   - price text.
   - availability text.
   - review section text.
   - return/shipping/about/contact hints.
3. Improve PDP candidate ranking.
4. Add tests for canonical attr ordering:
   - `rel` before `href`.
   - `href` before `rel`.
   - single quotes.
   - uppercase tags.

### Later / v2

1. Optional headless fallback for low-confidence scans.
2. GA4 connection UX.
3. Live OpenAI AI tips.
4. Provider-backed AI visibility module.
5. Marketplace-specific readiness.
6. Competitor intelligence.
7. Subscriptions/monitoring plans.

## 14. Testing Status

Latest checks run before this documentation pass:

```text
pnpm --filter @moads/api test -- aeo-scanner
pnpm --filter @moads/api typecheck
```

Result:

```text
54 tests passed
API typecheck passed
```

Canonical-specific test added:

- schema-backed page with `<link rel="canonical" href="https://example.com/p" />` must not report `canonical_missing`.

## 15. Handoff Instructions For Another LLM

When reviewing this project, do not suggest broad rewrites first.

Start with these questions:

1. Does first-screen copy match actual scanner behavior?
2. Does public scan avoid paid providers?
3. Does score remain deterministic and explainable?
4. Does the report distinguish weighted score from evidence layer?
5. Does the scanner produce false negatives for common HTML patterns?
6. Does checkout use Dodo products and idempotent ledger fulfillment?
7. Are free users blocked by membership copy anywhere in AEO?

Safe first PRs:

- canonical parser test expansion.
- first-screen copy correction.
- URL input `type="text"` conversion.
- content-structure extractor as evidence-only.
- PDP candidate ranking tests.

Avoid in pre-beta:

- adding Perplexity/OpenAI to public scan.
- hash-based score fallback.
- claiming real multi-engine measurement without provider-backed evidence.
- making subscriptions live before lifecycle handling exists.
