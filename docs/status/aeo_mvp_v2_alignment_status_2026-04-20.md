# AEO/LAB MVP v2 Alignment Status

Date: 2026-04-21  
Branch: `codex/fix-reference-video-duration-u5ad86df2c2`  
Current source HEAD: `28a9675`  
Latest pushed commit: `28a96758dbf457076e5cce2ef08de2d91c640de3`

## Source of truth
Priority order for this status:
1. `docs/aeo/aeo_pre_beta_handoff_2026-04-20.md` (with 2026-04-21 addendum)
2. v2 handoff files in `/Users/malevich/Downloads`
3. older launch/final/redesign docs as historical context only

## Confidence matrix

### CONFIRMED
- Current branch and current git HEAD are aligned to `28a9675`.
- Frontend AEO fix pack is committed and pushed to origin.
- Scope of latest change is frontend-only in `apps/aeo-web`.
- Existing API contracts were not changed by latest frontend pass.
- Product contract preserved:
  - free public scan;
  - URL-first public input;
  - deterministic score path for public scan;
  - AI tips remain `1 credit`;
  - Dodo credit packs remain active billing path.

### LIKELY
- Live runtime still serves an older frontend revision if no fresh deploy has been completed after `28a9675`.

### NEEDS CHECK
- Runtime/source parity after a fresh deploy.
- Firebase authorized-domain and provider settings for `aeo.moads.agency` if `auth/unauthorized-domain` is observed.
- Final Cloud Run revision names after successful deployment run.

## Latest implemented frontend changes (source)

Path scope:

```text
apps/aeo-web/*
```

High-level changes:
- Added AEO auth modal with Google + email/password + reset.
- Added AEO credit-packs modal and AEO-local checkout start flow.
- Added pre-auth lock behavior for top fixes (3 visible before unlock).
- Added post-auth expanded fixes behavior.
- Added site tabs UX in dashboard (frontend state derived from existing scans).
- Added account/menu access duplication in header and dashboard context.
- Normalized key AEO copy and CTA labels.
- Improved anchor landing behavior for scan-entry CTAs.
- Adjusted visual connector behavior in "How It Works" section.

## Deploy note

During latest deployment attempt, Cloud deploy command required fresh interactive `gcloud` re-auth.  
Until re-auth + redeploy are completed, runtime parity must be treated as **NEEDS CHECK**.

## Operator follow-up checklist

1. Refresh `gcloud` auth and ADC.
2. Run frontend deploy pipeline.
3. Re-check live endpoints:
   - `https://aeo.moads.agency/`
   - `https://lab.moads.agency/`
4. Validate AEO auth on live:
   - Google sign-in.
   - Email/password sign-in/sign-up.
   - Password reset.
5. Validate AEO packs popup and checkout start path from AEO report/dashboard.
