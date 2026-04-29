# MO Ads Platform — Production / Pre-Beta Status

Snapshot updated: 2026-04-20  
Repository: `moads-platform`  
Current branch at update time: `codex/fix-reference-video-duration-u5ad86df2c2`  
Pre-beta source anchor before docs update: `b73fee9`

## Canonical pre-beta handoff

Use this file for the detailed current specification:

- `docs/aeo/aeo_pre_beta_handoff_2026-04-20.md`

## Current product interpretation

AEO/LAB is in pre-beta stabilization:

- AEO public scan is free and deterministic.
- LAB is the billing/account center.
- Dodo Payments is the active AEO pack provider.
- OpenAI is optional for explicit AI tips only.
- Public scan does not call OpenAI or paid data providers.

## Historical live runtime note

Previously verified live revisions from older rollout work:

- `moads-api-00034-h54`
- `moads-aeo-web-00010-fn6`
- `moads-lab-web-00009-2mr`

These should be treated as historical until a fresh deploy/status check is run from the current branch.

## Latest source-side fix

Canonical false-positive fix:

- source commit: `b73fee9`
- behavior: parse `<link rel="canonical" href="...">` instead of treating canonical as a meta tag.

## Current QA status

Latest checks run:

```text
pnpm --filter @moads/api test -- aeo-scanner
pnpm --filter @moads/api typecheck
```

Result:

```text
54 tests passed
API typecheck passed
```

## Operational reminder

Before deployment, verify:

- active branch.
- target Cloud Run service.
- `gcloud auth login` freshness.
- Firebase Hosting target.
- whether source branch contains the expected visual/logo changes.
