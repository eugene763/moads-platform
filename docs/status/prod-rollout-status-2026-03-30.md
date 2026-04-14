# MO Ads Platform — Production Rollout Status

Snapshot date: 2026-04-14  
Repository: `moads-platform`  
Branch: `feature/motrend-wallet-fastspring`  
Current code anchor: `ac04f69`

## Current rollout state

### Last verified live revisions
- `moads-api` -> `moads-api-00034-h54`
- `moads-aeo-web` -> `moads-aeo-web-00010-fn6`
- `moads-lab-web` -> `moads-lab-web-00009-2mr`

### Last verified public checks
- `https://aeo.moads.agency/` -> HTTP `200`
- `https://lab.moads.agency/` -> HTTP `200`
- uncached `POST https://api.moads.agency/v1/aeo/public-scans` -> working

## What was rolled forward after the original March rollout

### Day-1 stabilization
- checker CTA routing fixed
- dashboard no longer shows membership-style gate for free baseline
- landing/report copy aligned with real score model

### Scanner improvements
- browser-like fetch headers
- controlled retry
- crawlability evidence
- sitemap/robots evidence
- PDP sampling for root/homepage scans
- hardened filtering so technical sitemap URLs are no longer treated as product pages

### Payments
- Dodo is the only active AEO pack billing provider
- FastSpring is no longer part of active AEO pack rollout

## Runtime notes

### AEO current behavior
- URL-only entry
- deterministic score
- broader evidence layer
- no paid provider calls in public scan

### LAB current behavior
- billing/account center
- pack-first commercial surface
- plans remain coming soon

## Operations notes

### Known non-blocking warnings
- Cloud Run deploys may show IAM policy warnings while still succeeding and routing traffic correctly

### Current operator friction
- `gcloud auth login` may be needed before future deploy or `gcloud run services describe` commands when token refresh expires

### Git vs runtime note
- current branch HEAD is newer than the last verified live runtime snapshot,
- latest commits after `d184e17` are primarily documentation/status alignment,
- until a fresh deploy is confirmed, keep the runtime revisions above as the last known live baseline

## Practical release interpretation

For current launch work, treat this as the real state:
- AEO and LAB are live
- Dodo pack commerce is the intended launch path
- scanner is stable enough for launch but still conservative on complex sites
- next meaningful backend iteration is richer content/PDP reading, not a new score philosophy
