# AEO/LAB MVP v2 Alignment Status

Date: 2026-04-20  
Branch: `codex/fix-reference-video-duration-u5ad86df2c2`  
Source HEAD at implementation start: `b9c9920`  
Implementation commit: `12a2325`

## Source of truth
Priority order used in this implementation pass:
1. `docs/aeo/aeo_pre_beta_handoff_2026-04-20.md`
2. v2 handoff files in `/Users/malevich/Downloads`
3. older final/launch/redesign docs as historical context only

## Block 0 alignment matrix

### CONFIRMED
- Branch and head were validated locally before edits.
- AEO public scan contract is still URL-first (`POST /v1/aeo/public-scans`).
- AI tips remain explicit action (`POST /v1/aeo/scans/:scanId/generate-ai-tips`) and still charge 1 credit.
- Dodo webhook route remains `POST /v1/billing/webhooks/dodo` with `payment.succeeded` handling.
- Runtime env key currently read by API is `DODO_WEBHOOK_KEY`.
- API config supports both names and normalizes fallback:
  - `DODO_WEBHOOK_KEY`
  - `DODO_WEBHOOK_SECRET`

### LIKELY
- Live runtime revisions can still drift from source between deploys.
- Historical docs with older revision numbers are stale.

### NEEDS CHECK
- Runtime-to-source parity after deploy (must be re-checked).
- Active secret resource naming policy across all environments.
- Firebase authorized domains should include only hostnames used by client-side Firebase auth flows.

## Implemented in this pass

### Frontend (`apps/aeo-web`)
- Landing copy is now free-first and shorter.
- Hero value proposition now centers on one free page readiness check.
- Scan input changed from strict `type="url"` to `type="text"` to allow `example.com` input.
- Scan CTA changed to `Run free check`.
- Added second-scan auth gate (client-side launch guard) for unauthenticated users.
- Public report IA compacted:
  - removed standalone public sections for `How This Score Works`, `Evidence`, `Priority Action Plan`, `Prompt Kit`.
  - consolidated into `Top Fixes` + compact crawler/readiness diagnostics.
- Public score label changed to `AI Discovery Readiness of page`.
- Added one-page scope note directly in report summary.
- Added lock/unlock CTA for hidden crawler diagnostics.
- Top navigation/lead links normalized to `https://moads.agency/#form`.
- Landing floating engine badges now use real SVG assets from `public/logos`.

### Backend (`services/api`)
- Scanner upgraded to v2 deterministic model with evidence-first contract:
  - new scored dimensions in payload:
    - `aiCrawlerAccessibility`
    - `answerOptimization`
    - `citationReadiness`
    - `technicalHygiene`
  - legacy compatibility fields retained:
    - `access`
    - `basicSeo`
    - `ratingsSchema`
- Added deterministic answer/readiness signal extraction:
  - question-style headings
  - FAQ block presence
  - Q/A count
  - direct answer quality checks
  - bullets/steps/tables
  - How To heading signal
  - FAQ schema visible-match
- Added crawlability evidence signals:
  - `llmsTxtExists`
  - `llmGuidancePage`
- Updated scanner versions in output:
  - `rulesetVersion: aeo_rules_v4`
  - `promptVersion: deterministic_v4`
  - `scoreVersion: aeo_score_v2`
- Route write-side score version updated to `aeo_score_v2`.

## What did not change
- Public scan remains free.
- OpenAI is still excluded from public scan path.
- AI tips billing contract remains unchanged (1 credit).
- Dodo packs remain active monetization path.
- No DB schema migrations were applied in this pass.
- Whole-site async snapshot workers/queues were not introduced yet.

## Required operator checks before/after deploy
1. Verify target project and region for deploy.
2. Verify Firebase domains needed for client auth.
3. Verify Dodo product IDs and webhook endpoint config.
4. Re-check `DODO_WEBHOOK_KEY`/`DODO_WEBHOOK_SECRET` policy in target env.
5. Run post-deploy smoke:
   - `/` landing free scan
   - `/r/:publicToken` report lock/unlock
   - `/dashboard` sign-in + history + wallet
   - pack checkout redirect starts from LAB

## Deployment outcome snapshot (same day)

### CONFIRMED
- Frontends deployed in project `gen-lang-client-0651837818`:
  - `moads-aeo-web` revision `moads-aeo-web-00013-t6b`
  - `moads-lab-web` revision `moads-lab-web-00012-m92`
- API deployed to live gateway-backed service:
  - `moads-api` revision `moads-api-00043-b99`
- Endpoint smoke:
  - `https://aeo.moads.agency` -> `200`
  - `https://lab.moads.agency` -> `200`
  - `https://api.moads.agency/health` -> `200`
- Scanner payload in new uncached scans returns:
  - `scoreVersion: "aeo_score_v2"`
  - `report.summary.scoreLabel: "AI Discovery Readiness of page"`
  - `report.summary.scope: "single_page"`

### NEEDS CHECK
- `cloud-run:deploy:pro` path still fails until `SESSION_COOKIE_SECRET_PRO` exists for `moads-api-pro` stack.
- Runtime UI parity with browser cache/CDN on all devices.
