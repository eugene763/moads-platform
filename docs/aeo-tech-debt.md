# AEO Tech Debt

Last updated: 2026-04-29

## P1

1. Harden Dodo webhook validation.
   - Owner: Backend/billing.
   - Context: Verify event status, environment, product ID, amount, currency, and account attribution before granting credits.
   - Suggested fix: Add fixture-backed webhook tests for live/test payloads and rejection cases.

2. Add an AEO-only prod frontend deploy path.
   - Owner: Platform/frontend.
   - Context: `cloud-frontends:deploy:pro` deploys AEO and Lab and can touch Hosting/domain mappings.
   - Suggested fix: Add a prod AEO-only Cloud Run deploy script first; keep Hosting/domain changes as explicit separate operations.

3. Replace heuristic dev noindex detection with an explicit flag.
   - Owner: Frontend/platform.
   - Context: Dev noindex currently depends on host or API-base detection.
   - Suggested fix: Add a public runtime/build flag such as `NEXT_PUBLIC_AEO_NOINDEX=true` only for dev-cloud.

4. Add CI release checks.
   - Owner: Platform.
   - Context: No visible GitHub workflow currently enforces typecheck/test gates.
   - Suggested order: DB typecheck, API typecheck, AEO web typecheck, DB tests, `git diff --check`, then AEO web build.

5. Move public scan rate limiting out of process memory.
   - Owner: Backend/platform.
   - Context: Current public scan limit is per Cloud Run instance.
   - Suggested fix: Use Redis, database counters, Cloud Armor, or API gateway controls.

## P2

1. Clean up public scan `planVisibility` response copy.
   - Owner: Backend/frontend.
   - Context: Response still exposes legacy names such as AI tips credit cost and Lab checkout surface.
   - Suggested fix: Rename response fields or add new AEO-specific fields, then migrate frontend reads.

2. Make public report developer sharing match workspace sharing.
   - Owner: Frontend.
   - Context: Public report and authenticated workspace have diverged share/export behavior.
   - Suggested fix: Centralize report share copy and Web Share fallback in one AEO web helper.

3. Refresh credit modal copy.
   - Owner: Frontend/product.
   - Context: Some copy still references tips rather than Deep Site Scan and diagnostics.
   - Suggested fix: Audit AEO user-facing strings and add a lightweight text regression test if practical.

4. Expand analytics coverage.
   - Owner: Growth/frontend.
   - Context: Analytics helper exists, but key MVP events are not consistently emitted.
   - Suggested events: public scan start/success/failure, auth intent saved, Deep Site Scan start/success/failure, insufficient credits, pack modal open, checkout start/error, scan removal, report share.

5. Add AEO web build to pre-deploy checks.
   - Owner: Frontend/platform.
   - Context: Typecheck does not catch all Next.js build/runtime issues.
   - Suggested fix: Run `pnpm --filter @moads/aeo-web build` in release validation once build time is acceptable.

6. Improve scanner evidence model.
   - Owner: Backend/AEO.
   - Context: UI has harmonization layers for crawler accessibility and grouped issues.
   - Suggested fix: Emit stable evidence fields from scanner v2 and gradually reduce UI inference.

7. Add distributed scan job controls.
   - Owner: Backend/platform.
   - Context: Deep Site Scan is capped, but scan work still runs in the request path.
   - Suggested fix: Move longer site scans to a queue when caps increase beyond launch mode.

## Suggested Order

1. Dodo webhook tests and validation.
2. AEO-only prod frontend deploy path.
3. Explicit dev noindex flag.
4. CI release gate.
5. Distributed public scan rate limiting.
6. Analytics event map.
7. Scanner evidence v2.
