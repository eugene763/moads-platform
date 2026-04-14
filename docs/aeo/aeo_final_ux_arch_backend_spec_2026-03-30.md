# AEO/LAB Final UX + Architecture + Backend Spec

Date: 2026-04-14  
Status: Live launch contract for the current contour  
Repository: `moads-platform`  
Branch: `feature/motrend-wallet-fastspring`  
Git anchor: `d184e17`

## 1) Purpose

This document is the current source of truth for how AEO/LAB works in production-like launch mode.

If older planning docs conflict with this file, this file wins for:
- UX behavior,
- score interpretation,
- billing provider choice,
- dashboard gating,
- scanner/evidence boundaries.

## 2) Locked product decisions

### 2.1 Access model
- `Free` is live
- `Starter`, `Pro`, `Store` are not live billing products yet
- `Deep Audit` is lead-based only

### 2.2 Pack model
- `Pack S` -> 30 credits -> `$4.99`
- `Pack M` -> 80 credits -> `$9.99`
- `Pack L` -> 200 credits -> `$19.99`

Rules:
- packs are usage bundles only
- packs are not subscriptions
- `1 credit = 1 AI tips generation`
- public scan is free

### 2.3 Active payment provider
- Dodo Payments only
- no active FastSpring path remains in AEO pack flow

## 3) Current UX contract

### 3.1 Landing
- one-field checker: `Store URL`
- nav CTA is `Open Checker`
- nav CTA and free pricing CTA route to `/#scan`
- copy reflects the real score model, not an inflated dimension promise

### 3.2 Report
- public score is visible before auth
- report shows:
  - `Scored now`
  - `Evidence layer`
  - `Priority Action Plan`
  - `Prompt Kit`
- deeper account-only functionality stays behind sign-in/claim

### 3.3 Dashboard
- free users can sign in and view dashboard basics
- dashboard must not require paid membership for basic access
- missing session shows sign-in gate only

### 3.4 LAB
- utility billing/account center
- pack-first surface
- coming-soon plan framing remains informational only

## 4) Score contract

The current top-line score is deterministic and shared for everyone.

### 4.1 Scored now
- `Access`
- `Basic SEO`
- `Ratings Schema`

### 4.2 Evidence layer
- crawlability
- product-page sample
- action plan
- prompt kit
- connected data widgets

### 4.3 Must not affect score
- OpenAI
- GA4
- realtime stream
- monitored query intelligence
- external SERP/AI APIs

## 5) Scanner contract

The current scanner is a raw-HTML, server-side rules engine.

### 5.1 Current read path
1. normalize requested URL
2. fetch requested URL with browser-like headers
3. one controlled retry on retryable/network-like failure
4. parse HTML for:
   - title
   - meta description
   - canonical
   - og/twitter title
   - JSON-LD
   - AggregateRating
   - visible review/rating evidence

### 5.2 Evidence-first enrichments now live
- `robots.txt`
- `sitemap.xml`
- AI bot crawlability checks
- homepage/root PDP sampling
- report action plan
- manual prompt kit

### 5.3 Current scanner limits
- no mandatory JS rendering
- no paid provider calls
- no headless browser fallback yet
- PDP discovery is improved but still conservative

## 6) Auth and security contract

- shared Firebase identity provider
- session cookie on `.moads.agency`
- wallet ledger remains the source of truth
- server-side only for:
  - scoring
  - claim
  - AI tips charging
  - webhook processing
  - secret usage

Relevant live secrets:
- `DODO_API_KEY`
- `DODO_WEBHOOK_KEY`
- `OPENAI_API_KEY`

## 7) API contract

Primary namespaces:
- `/v1/auth/*`
- `/v1/me`
- `/v1/wallet/*`
- `/v1/aeo/*`
- `/v1/lab/*`
- `/v1/billing/webhooks/dodo`

Key behaviors:
- `POST /v1/aeo/public-scans` stays `siteUrl`-only
- public scan is free
- `generate-ai-tips` stays explicit and credit-billed
- Dodo webhook is centralized under `/v1/billing/webhooks/dodo`

## 8) OpenAI contract

OpenAI is not part of public scanning.

Current intended role:
- optional post-scan AI tips
- explicit user action
- usage-based via credits

Prompt strategy:
- prompt lives in backend code for now
- no OpenAI-side prompt product is required for launch

## 9) Last verified runtime

Last verified live revisions:
- `moads-api` -> `moads-api-00034-h54`
- `moads-aeo-web` -> `moads-aeo-web-00010-fn6`
- `moads-lab-web` -> `moads-lab-web-00009-2mr`

Live checks:
- `https://aeo.moads.agency/` -> `200`
- `https://lab.moads.agency/` -> `200`
- uncached public scan works

## 10) Current priority gap list

1. stronger PDP discovery
2. objective content-structure scoring
3. JS-heavy fallback path
4. finishing live AI tips rollout if desired
