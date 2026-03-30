# MO Ads Platform — Production Rollout Status

## Snapshot
- Timestamp: 2026-03-30 13:18:44 +04
- Repository: `moads-platform`
- Commit deployed target: `b359096`
- Active gcloud account: `eugene@moads.agency`
- Active project for executed deploys: `gen-lang-client-0651837818`

## Actions Executed
1. `pnpm cloud-run:deploy:prod`
2. `pnpm cloud-lb:bootstrap:prod`
3. `pnpm cloud-frontends:deploy:pro`
4. `pnpm cloud-run:deploy:pro` (attempted)
5. `pnpm cloud-lb:bootstrap:pro-gateway`
6. `pnpm db:sync:managed:prod` (attempted)
7. Manual managed-prod DB sync with `prisma db push --accept-data-loss` + seed + backfill/sync scripts (attempted)
8. `pnpm db:sync:managed:pro` (attempted)

## Runtime Status (Current)
### Cloud Run services (us-central1)
- `moads-api` -> revision `moads-api-00012-n79` (updated)
- `moads-aeo-web` -> revision `moads-aeo-web-00003-9zl` (updated)
- `moads-lab-web` -> revision `moads-lab-web-00003-x99` (updated)
- `moads-api-dev` -> revision `moads-api-dev-00009-j85` (unchanged in this rollout)

### Public endpoint checks
- `https://aeo.moads.agency/` -> HTTP 200
- `https://lab.moads.agency/` -> HTTP 200
- `https://moads-aeo.web.app/` -> HTTP 200
- `https://moads-lab.web.app/` -> HTTP 200
- `POST https://api.moads.agency/v1/aeo/public-scans` with `{"siteUrl":"https://example.com"}` -> HTTP 200

### Firebase custom domain state
- `aeo.moads.agency` on site `moads-aeo` -> `OWNERSHIP_ACTIVE`, `HOST_ACTIVE`, `CERT_ACTIVE`
- `lab.moads.agency` on site `moads-lab` -> `OWNERSHIP_ACTIVE`, `HOST_ACTIVE`, `CERT_ACTIVE`

## Load Balancer Status
### Prod API LB (`bootstrap-moads-api-prod-lb.sh`)
- API host: `api.moads.agency`
- Cert status: `ACTIVE`
- IPv4: `34.160.111.112`
- IPv6: `2600:1901:0:7fdc::`
- DNS currently resolves to above addresses.

### Pro gateway LB (`bootstrap-moads-api-pro-gateway-lb.sh`)
- Resources were created in project `gen-lang-client-0651837818`.
- Cert status: `PROVISIONING`
- IPv4: `34.96.69.153`
- IPv6: `2600:1901:0:d0a5::`
- Note: this is additional gateway infrastructure; production DNS is still pointed to prod API LB addresses.

## Database Sync Status
### Managed prod DB
- `prisma db push --accept-data-loss` -> completed successfully.
- `db:seed` -> completed.
- `backfill-legacy-support-codes.ts` -> completed (`scanned=13, updated=0, skipped=13`).
- `sync-legacy-motrend-templates.ts` -> failed due Google auth re-auth token issue:
  - `invalid_grant`
  - `invalid_rapt`

### Managed pro DB
- `pnpm db:sync:managed:pro` failed.
- Reason: no access to project `moads-pro` (Secret Manager permission error / consumer invalid for current account/project context).

## Pro API Status
- `pnpm cloud-run:deploy:pro` failed before deploy.
- Blocking missing secret in target project context:
  - `SESSION_COOKIE_SECRET_PRO`
- `MOADS_API_PRO_DATABASE_URL` is also expected by deploy script and should exist in the pro contour.

## Known Blockers / Follow-up Required
1. Complete re-auth for gcloud user and rerun legacy template sync on managed prod DB:
   - `gcloud auth login`
   - rerun `pnpm db:sync:legacy-templates:prod` (or the script directly with prod DB env/proxy)
2. Provide/access actual pro contour project and required secrets for pro API deploy:
   - `SESSION_COOKIE_SECRET_PRO`
   - `MOADS_API_PRO_DATABASE_URL`
   - plus pro Cloud SQL + permissions for `db:sync:managed:pro`
3. Confirm whether the newly created `moads-api-gateway-*` resources in `gen-lang-client-0651837818` should remain or be moved to a dedicated gateway project as originally planned.

## Verification Commands Used
- `gcloud run services list --region=us-central1`
- `curl -I https://aeo.moads.agency/`
- `curl -I https://lab.moads.agency/`
- `curl -X POST https://api.moads.agency/v1/aeo/public-scans ...`
- Firebase Hosting custom-domain API checks via `firebasehosting.googleapis.com`
- `dig api.moads.agency A/AAAA`
