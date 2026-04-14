# AEO/LAB Service Status (Git-Anchored)

Snapshot date: 2026-04-14  
Repository: `moads-platform`  
Branch: `feature/motrend-wallet-fastspring`  
Current HEAD: `ac04f69`

## 1) Git anchors

Important recent commits:
- `054b4bb` — day-1 scan/dashboard stabilization
- `99c4035` — free pricing CTA points to checker anchor
- `d184e17` — product-page sampling hardened for scanner
- `748e531` — canonical final launch handoff doc added
- `ac04f69` — current branch head after latest docs/status alignment

Interpretation rule:
- runtime behavior should be read from these commits plus the live checks below
- branch HEAD is ahead of the last verified runtime snapshot; latest post-runtime commits are documentation/status work rather than a newly confirmed runtime rollout

## 2) Last verified live runtime

Last verified Cloud Run revisions:
- `moads-api` -> `moads-api-00034-h54`
- `moads-aeo-web` -> `moads-aeo-web-00010-fn6`
- `moads-lab-web` -> `moads-lab-web-00009-2mr`

Last verified public checks:
- `https://aeo.moads.agency/` -> `200`
- `https://lab.moads.agency/` -> `200`
- `POST https://api.moads.agency/v1/aeo/public-scans` -> working

## 3) What is live now

### AEO
- landing with URL-only checker
- public scan -> public token -> public report
- sign-in gate for account features
- free dashboard access after sign-in
- richer report IA:
  - scored-now block
  - evidence layer
  - action plan
  - prompt kit

### LAB
- account/billing center
- pack-first commercial surface
- coming-soon framing for plans

### Billing
- Dodo-only AEO pack model
- Dodo webhook route mounted at:
  - `POST /v1/billing/webhooks/dodo`

## 4) API coverage currently in code

### `/v1/aeo`
- `POST /v1/aeo/public-scans`
- `GET /v1/aeo/public-scans/:publicToken`
- `POST /v1/aeo/waitlist`
- `POST /v1/aeo/scans/:scanId/claim`
- `GET /v1/aeo/scans`
- `GET /v1/aeo/scans/:scanId`
- `POST /v1/aeo/scans/:scanId/generate-ai-tips`
- `GET /v1/aeo/evidence/ga4`
- `GET /v1/aeo/realtime/stream`

### `/v1/lab`
- `GET /v1/lab/center`
- current order/account center routes used by LAB

### auth / me / wallet
- `POST /v1/auth/session-login`
- `POST /v1/auth/session-logout`
- `GET /v1/auth/me`
- `GET /v1/me`
- `GET /v1/wallet/summary`

## 5) Scanner status

Current scanner characteristics:
- deterministic
- raw HTML only
- browser-like fetch headers
- one controlled retry
- evidence-first enrichments:
  - robots
  - sitemap
  - AI bot rules
  - product-page sample
  - action plan
  - prompt kit

Current limitation:
- no headless browser fallback
- no paid-provider intelligence inside public scan

Recent hardening:
- technical sitemap URLs are no longer used as fake product pages
- if no valid HTML PDP sample is found, report now returns `productPage: none`

## 6) Current blockers / non-blockers

### Non-blocking
- IAM warnings during Cloud Run deploys still appear, but deploys complete and traffic routes correctly

### Current operational friction
- `gcloud auth login` may be needed before future deploy/describe commands if token refresh expires

### Not considered blockers for launch baseline
- live monitored intelligence
- recurring subscriptions
- headless render fallback

## 7) Practical truth for implementers

Use this as the current reality:
- AEO/LAB are live in the current contour
- score is narrower than the marketing surface and that is intentional
- evidence layer is broader than the top-line score
- Dodo is the active payments path
- public scan still avoids paid provider calls
