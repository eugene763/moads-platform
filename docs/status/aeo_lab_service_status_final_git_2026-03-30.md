# AEO/LAB Service Status — Pre-Beta Update

Updated: 2026-04-20  
Repository: `moads-platform`  
Current branch at update time: `codex/fix-reference-video-duration-u5ad86df2c2`  
Pre-beta source anchor before docs update: `b73fee9`

## Canonical document

The detailed technical and UX spec is now:

- `docs/aeo/aeo_pre_beta_handoff_2026-04-20.md`

## Current service contract

- AEO public scan: free, URL-only, deterministic.
- AEO report: public score + evidence layer + unlock/account actions.
- AEO dashboard: free baseline sign-in access, wallet/scans/evidence/AI tips actions.
- LAB: account and credit-pack billing center.
- Billing: Dodo Payments only for AEO credit packs.
- OpenAI: explicit AI tips only, not public score.

## Score contract

Weighted score blocks:

- Access.
- Basic SEO.
- Ratings Schema.

Evidence-only blocks:

- crawlability.
- robots/sitemap.
- AI bot rules.
- product-page sample.
- action plan.
- prompt kit.
- connected evidence widgets.

## Latest source-side change

Canonical parsing has been fixed at source anchor `b73fee9`:

- standard canonical link tags are now parsed correctly.
- false `canonical_missing` for normal `<link rel="canonical" href="...">` pages should be resolved after API deploy.

## Review risks

- Branch/runtime mismatch is possible because recent work involved rollback branches.
- Some visual/logo changes may exist in one branch/runtime but not another.
- Verify current source before declaring frontend visual state final.
