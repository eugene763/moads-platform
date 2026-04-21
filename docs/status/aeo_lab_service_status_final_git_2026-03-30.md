# AEO/LAB Service Status — Final Git Snapshot (Updated)

Updated: 2026-04-21  
Repository: `moads-platform`  
Branch: `codex/fix-reference-video-duration-u5ad86df2c2`  
Source HEAD: `28a9675`

## Canonical spec

Primary technical handoff:

- `docs/aeo/aeo_pre_beta_handoff_2026-04-20.md` (includes 2026-04-21 addendum)

Current alignment/status file:

- `docs/status/aeo_mvp_v2_alignment_status_2026-04-20.md`

## Current source-side contract

- AEO public scan is free and URL-first.
- Public score path is deterministic and does not call OpenAI.
- AI tips are explicit paid action (`1 credit`).
- AEO/LAB billing uses Dodo credit packs.
- LAB remains account/billing center.
- Subscription plans remain non-live (`coming soon` behavior in UX).

## Latest source update in git

```text
28a96758dbf457076e5cce2ef08de2d91c640de3
feat(aeo-web): improve auth flows, gated fixes, tabs, and pack modal UX
```

Key impact:
- AEO auth modal expanded (Google + email/password + reset).
- Top-fixes lock/unlock UX improved.
- AEO-local pack popup checkout start added.
- Dashboard tabs/account access improved.

## Runtime caution

Source was pushed, but runtime may still show previous frontend revisions until fresh deploy is completed with valid `gcloud` auth session.  
Treat source/runtime parity as **NEEDS CHECK** until post-deploy smoke verifies latest UI.

## Immediate operator checks

1. Re-auth `gcloud` and ADC in deploy environment.
2. Deploy frontends.
3. Verify live auth on `aeo.moads.agency`:
   - authorized domain in Firebase;
   - Google provider enabled;
   - email/password provider enabled.
4. Verify live AEO pack popup checkout starts correctly.
