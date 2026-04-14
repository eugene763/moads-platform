# AEO/LAB Final Launch Handoff

Date: 2026-04-14  
Repository: `moads-platform`  
Branch: `feature/motrend-wallet-fastspring`
Current HEAD: `ac04f69`

## 1) Current launch position

AEO/LAB is live as a `Free + Credit Packs` launch.

Live product model:
- `Free` = public deterministic scan + score + auth unlock
- `Pack S` = 30 credits = `$4.99`
- `Pack M` = 80 credits = `$9.99`
- `Pack L` = 200 credits = `$19.99`
- `Starter`, `Pro`, `Store` = coming soon only
- `Deep Audit` = lead form / agency CTA only

Key product rules:
- `1 credit = 1 AI tips generation`
- public scan is always free
- plans and packs must stay semantically separate
- public scan does not depend on OpenAI or paid data providers

## 2) Current live runtime

Last verified live revisions before this handoff:
- `moads-api` -> `moads-api-00034-h54`
- `moads-aeo-web` -> `moads-aeo-web-00010-fn6`
- `moads-lab-web` -> `moads-lab-web-00009-2mr`

Interpretation note:
- branch HEAD is now ahead of the last verified runtime snapshot,
- latest commits after `d184e17` are primarily docs/status/billing-surface alignment,
- any next frontend deploy may still require fresh `gcloud auth login`.

Live endpoints:
- `https://aeo.moads.agency/`
- `https://lab.moads.agency/`
- `https://api.moads.agency/v1/aeo/public-scans`

## 3) UX contract

### AEO landing
- single required field: `Store URL`
- top nav CTA: `Open Checker`
- nav CTA points to `/#scan`
- free pricing CTA also points to `/#scan`
- copy is aligned to the real score model:
  - `Free score`
  - `Scored now: 3 blocks`
  - `Evidence layer included`

### Public report
- score is public
- report shows:
  - scored-now block
  - evidence layer
  - top fixes
  - action plan
  - prompt kit
- deeper account surfaces remain behind sign-in/claim

### Dashboard
- free users can sign in and access basic dashboard surfaces
- dashboard no longer requires paid membership for baseline access
- if session is missing, only the sign-in gate is shown

### LAB
- LAB is the account/billing center
- pack-first surface
- plans stay coming soon / lead-based

## 4) How scanning works right now

Scanner implementation lives in:
- `services/api/src/lib/aeo-scanner.ts`

Current scan path:
1. normalize `siteUrl`
2. fetch requested URL server-side
3. use browser-like request headers
4. apply one controlled retry on retryable/network-like failure
5. parse raw HTML for:
   - title
   - meta description
   - canonical
   - og/twitter title
   - JSON-LD
   - AggregateRating
   - visible review/rating evidence

No mandatory headless browser is used.
No OpenAI is used during public scan.
No paid provider calls are used during public scan.

## 5) Current score model

Top-line score is deterministic and rules-based.

### Scored now
- `Access`
- `Basic SEO`
- `Ratings Schema`

These are the only weighted score blocks in the current top-line score.

### Evidence layer
These enrich the report but do not change the score:
- crawlability
- sitemap / robots discovery
- AI bot rules
- product-page sample
- action plan
- prompt kit
- connected evidence widgets

## 6) Scanner improvements already live

The current scanner already includes:
- browser-like headers instead of the earlier bot-like UA
- controlled retry
- `robots.txt` parsing
- `sitemap.xml` parsing
- AI bot reachability/rule extraction for:
  - `GPTBot`
  - `ClaudeBot`
  - `Google-Extended`
  - `PerplexityBot`
- product-page enrichment for homepage/root scans
- richer report IA:
  - action plan
  - prompt kit

Recent hardening:
- technical sitemap URLs such as `sitemap-index.xml` are no longer treated as product pages
- product-page sampling now prefers valid HTML candidate pages
- if no valid sample exists, report returns `productPage: none` instead of fake/technical URLs

## 7) What still limits reading quality

Current limitations:
- no JS rendering
- no headless fallback yet
- PDP discovery is improved but still conservative
- content-structure signals are not yet part of the weighted score

That means the scanner is now more honest and less error-prone, but still intentionally narrow for launch.

## 8) Billing and payments

Active provider for AEO packs:
- Dodo Payments only

Mapped Dodo products:
- `Pack S` -> `pdt_0NcVKMKum3pnZI0k9W9GP`
- `Pack M` -> `pdt_0NcVKTv8PCbSE5KplPmSI`
- `Pack L` -> `pdt_0NcVKZ0msSsA9QJ8ZVzH6`

Webhook:
- `POST /v1/billing/webhooks/dodo`

Required runtime secrets:
- `DODO_API_KEY`
- `DODO_WEBHOOK_KEY`
- `OPENAI_API_KEY`

## 9) OpenAI status

OpenAI is not part of public scanning.

Current intended role:
- optional post-scan AI tips only
- explicit user action only
- usage-based by credits

OpenAI setup requires only:
- billing enabled in OpenAI Platform
- API key created
- key stored in `OPENAI_API_KEY`

No assistants, GPT products, or prompt objects are required for launch.

## 10) Current priorities after launch baseline

Highest-value next backend steps:
1. stronger PDP discovery
2. objective content-structure scoring
3. headless fallback only for JS-heavy / low-confidence cases
4. optionally enabling live AI tips once desired

## 11) Canonical companion docs

- `docs/aeo/aeo_lab_final_spec_2026-03-30.md`
- `docs/aeo/aeo_final_ux_arch_backend_spec_2026-03-30.md`
- `docs/aeo/aeo_codex_block_prompts_final_2026-03-30.md`
- `docs/billing/dodo_aeo_operator_checklist_2026-04-02.md`
- `docs/status/aeo_lab_service_status_final_git_2026-03-30.md`
- `docs/status/prod-rollout-status-2026-03-30.md`
