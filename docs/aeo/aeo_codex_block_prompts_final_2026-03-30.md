> Pre-beta update, 2026-04-20: for current AEO/LAB source-of-truth, use `docs/aeo/aeo_pre_beta_handoff_2026-04-20.md`. This older document is retained for historical context and may contain outdated branch/runtime references.

# AEO/LAB Final Block Prompt Pack for Codex

Date: 2026-04-14  
Goal: run implementation in autonomous blocks with minimal user interruption against the current live launch baseline.

## Global execution rules (for all blocks)

- Use repository: `/Users/malevich/Documents/Playground/moads-platform`
- Git anchor: `ac04f69`
- Runtime interpretation note:
  - current branch HEAD is newer than the last verified live runtime snapshot,
  - latest commits after `d184e17` are docs/status and rollout-alignment work,
  - when re-deploying frontends, expect possible `gcloud auth login` reauth before Cloud Run/Firebase commands succeed
- Practical baseline:
  - live score = deterministic 3-block score,
  - evidence layer = crawlability + product sample + action plan + prompt kit,
  - Dodo = only active AEO billing provider
- Keep `free-first` UX and economy:
  - public scan free,
  - score deterministic and shared across plans,
  - AI tips only on explicit action for `1 credit`.
- Never mix entities in copy:
  - plans = subscriptions (`Free`, `Starter`, `Pro`, `Store`, `Deep Audit`)
  - packs = credit bundles (`Pack S/M/L`)
- Secrets and paid integrations remain server-side only.
- Default connector mode: `mock`, unless live secrets are explicitly provided.
- Dodo launch phase is `Free + Packs only`; recurring subscriptions are deferred.

---

## Block A — Environment, Access, Permissions

### Input
- Current repo state and local env files.
- Existing scripts under `infra/scripts/cloud`.
- Current status docs under `docs/status`.

### Prompt
```text
Audit current environment readiness for AEO/LAB rollout without mutating production resources first.
Validate git branch state, required env vars, Firebase/GCP project bindings, and script prerequisites.
Produce a gap report with exact missing permissions/secrets and a safe execution order.
```

### Steps
1. Validate git snapshot and working tree status.
2. Check required env keys for AEO/LAB/API and frontend deploy scripts.
3. Verify current project bindings and domain mapping prerequisites.
4. Validate access to secret names and Cloud SQL references.
5. Generate a concise “ready vs missing” table.

### Done criteria
- Clear list of blockers with exact key names and owning platform (`Firebase`, `GCP`, `Secret Manager`).
- No destructive changes to live infra in this block.

### Artifacts
- `docs/status/aeo_lab_env_access_audit_<date>.md`
- command log excerpt with pass/fail checks.

---

## Block B — Frontend Cleanup (`free-first`)

### Input
- AEO app code in `apps/aeo-web`.
- LAB app code in `apps/lab-web`.
- Final UX spec file:
  - `docs/aeo/aeo_final_ux_arch_backend_spec_2026-03-30.md`

### Prompt
```text
Implement the final free-first UX cleanup for AEO/LAB.
On AEO landing, remove optional fields (Brand Name, Category, Work Email, Platform) and remove “for e-commerce” wording.
Keep only URL-first flow, preserve lock/unlock report model, and keep moads-style minimal UI.
Use Coolvetica only for hero/score headings; keep body typography performant and readable.
Ensure responsive behavior and no critical logic in frontend state.
```

### Steps
1. Simplify AEO scan form to URL-only payload.
2. Update landing/report/dashboard copy to free-first contract.
3. Keep share/print actions in public report.
4. Ensure `Pack S/M/L` are the only live purchase actions and `Starter/Pro/Store/Deep Audit` positioning follows lead/coming-soon rules.
5. Validate mobile layout and loading performance regressions.

### Done criteria
- No removed functionality that breaks current auth/report flow.
- UI text consistently separates plans vs packs.
- No secrets or privileged calculations moved to frontend.

### Artifacts
- PR diff touching `apps/aeo-web` and optionally `apps/lab-web`.
- screenshot set (desktop + mobile) for landing/report/dashboard.

---

## Block C — Backend Alignment (Credits, Plans/Packs, Leads)

### Input
- Routes in `services/api/src/routes`.
- DB package in `packages/db/src`.
- Prisma schema and seed files.

### Prompt
```text
Align backend behavior with final free-first contract:
- keep public scan free,
- keep score deterministic and plan-agnostic,
- grant one-time AEO welcome credit idempotently on first AEO activation,
- enforce plan vs pack semantic separation in API responses and UI-facing labels,
- preserve waitlist flows for Starter, Pro, Store, and Deep Audit,
- keep Dodo limited to one-time AEO credit packs in this phase.
Do not add new API families unless strictly required.
```

### Steps
1. Add idempotent welcome-credit grant for first AEO activation path.
2. Verify AI tips debit path stays 1 credit and idempotent-safe.
3. Normalize API payload naming to avoid plan/pack confusion.
4. Ensure waitlist endpoint accepts clear intent (`starter/pro/store/deep_audit`).
5. Add/adjust tests for wallet/ledger idempotency and unlock path.

### Done criteria
- Ledger remains source of truth.
- No direct credit mutation from frontend.
- Existing `/v1/aeo` and `/v1/lab` contracts remain backward-safe.

### Artifacts
- backend diff (`services/api`, `packages/db`, tests).
- test output summary for unit/integration paths.

---

## Block D — Integrations Scaffold (OpenAI/GA4/Realtime)

### Input
- Adapter layer in `services/api/src/lib/aeo-adapters.ts`.
- Environment config and deploy scripts.

### Prompt
```text
Harden integration scaffolding for OpenAI, GA4, realtime evidence, and Dodo pack billing.
Default to mock mode, keep live mode behind secrets and explicit flags.
Implement queue-safe, resource-efficient behavior for paid actions and avoid blocking request paths.
Ensure all key integration calls are server-side only.
```

### Steps
1. Verify mock/live switching and fallback behavior.
2. Enforce secret-gated live connectors and Dodo credentials.
3. Add timeout/retry/queue safety for AI tips generation path.
4. Keep GA4/realtime in evidence layer only (not score layer).
5. Add operational logging for cost and failure analysis.
6. Keep subscriptions out of live billing scope for this phase.

### Done criteria
- Integration code runs in mock mode without external credentials.
- No OpenAI calls occur during baseline deterministic scan.
- Failures degrade gracefully with user-safe messaging.

### Artifacts
- adapter and config diff,
- connector mode matrix (`mock` vs `live`) in markdown.

---

## Block E — Deploy, Smoke, Rollback

### Input
- Cloud scripts in `infra/scripts/cloud`.
- Status docs in `docs/status`.

### Prompt
```text
Deploy AEO/LAB/API updates safely in the current active project contour, then run smoke checks for domain routing, public scan, auth/session, and dashboard basics.
Generate rollback-ready notes and post-deploy verification docs.
Do not proceed to dedicated moads-pro contour until required secrets/permissions are confirmed.
```

### Steps
1. Sync DB if needed (non-destructive path first).
2. Deploy API and frontends with current project config.
3. Verify:
   - `https://aeo.moads.agency/`
   - `https://lab.moads.agency/`
   - `POST /v1/aeo/public-scans`
4. Verify auth cookie flow across subdomains.
5. Document rollback command sequence and current active revisions.

### Done criteria
- All public endpoints return expected status codes.
- Critical MVP flow works end-to-end:
  public scan -> report -> auth/claim -> dashboard -> AI tips action.
- Rollback instructions are concrete and tested for command correctness.

### Artifacts
- `docs/status/aeo_lab_rollout_<date>.md`
- deployment command log and smoke-check summary.

---

## Suggested execution order

1. Block A  
2. Block B  
3. Block C  
4. Block D  
5. Block E

Hard gate between D and E:
- Do not switch connectors to live mode without confirmed secrets and permission readiness.
