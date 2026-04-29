# AEO/LAB Launch Handoff

This document has been superseded for pre-beta review by:

- `docs/aeo/aeo_pre_beta_handoff_2026-04-20.md`

## Current canonical state

Date updated: 2026-04-20  
Repository: `moads-platform`  
Current branch at update time: `codex/fix-reference-video-duration-u5ad86df2c2`  
Pre-beta code anchor before docs update: `b73fee9`

## Summary

AEO/LAB is currently treated as a pre-beta launch stabilization build.

Current product position:

- `Free` public deterministic scan.
- `Credit Packs` via Dodo Payments.
- `Deep Audit` lead form.
- `Starter`, `Pro`, `Store` monitoring plans remain coming soon.
- OpenAI is not part of public scan.
- GA4/realtime evidence remains mock/scaffold unless explicitly enabled later.

## Scanner contract

Top-line score is deterministic and weighted only by:

- Access.
- Basic SEO.
- Ratings Schema.

Evidence layer includes:

- crawlability.
- robots/sitemap.
- AI bot rules.
- product-page sample.
- action plan.
- prompt kit.

Canonical parser status:

- Fixed in `b73fee9` to parse standard `<link rel="canonical" href="...">` tags.

## Billing contract

Active AEO payment provider:

- Dodo Payments only.

AEO products:

- `aeo_pack_s` -> `pdt_0NcVKMKum3pnZI0k9W9GP`
- `aeo_pack_m` -> `pdt_0NcVKTv8PCbSE5KplPmSI`
- `aeo_pack_l` -> `pdt_0NcVKZ0msSsA9QJ8ZVzH6`

Webhook:

- `POST /v1/billing/webhooks/dodo`

## Detailed spec

Use the current canonical handoff for full technical details:

- `docs/aeo/aeo_pre_beta_handoff_2026-04-20.md`
