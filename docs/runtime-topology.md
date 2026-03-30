# Runtime Topology

## Domain -> service -> database -> queue -> repo

| Domain / entrypoint | Runtime role | Cloud Run service | Cloud SQL | Queues | Repo |
| --- | --- | --- | --- | --- | --- |
| `trend.moads.agency` | prod frontend (`MoTrend`) | n/a | n/a | n/a | `motrend` |
| `api.moads.agency` | prod backend API | `moads-api` | `moads-platform-prod` | `motrend-submit-prod`, `motrend-poll-prod`, `motrend-download-prod` | `moads-platform` |
| `api-dev.moads.agency` | dev-cloud verification API | `moads-api-dev` | `moads-platform-dev` | `motrend-submit`, `motrend-poll`, `motrend-download` | `moads-platform` |
| `localhost:8080` | default local API | local `tsx` process | Docker Postgres (`moads_local`) | local/internal task loop by default | `moads-platform` |
| `localhost:3000` | default local frontend | local frontend dev server | n/a | n/a | `motrend` |

## Canonical cloud project

- project: `gen-lang-client-0651837818`
- region: `us-central1`
- prod ingress: HTTPS Load Balancer -> `moads-api`
- dev-cloud ingress: direct `api-dev.moads.agency` -> `moads-api-dev`

## Session and runtime separation

- prod cookie: `moads_session`
- dev-cloud cookie: `moads_session_dev`
- local profile: `MOADS_ENV=local`
- dev-cloud profile: `MOADS_ENV=dev-cloud`
- prod profile: `MOADS_ENV=prod`

The repo treats `local` as the default loop. `dev-cloud` is only for verification against the existing managed contour, and `prod` is deploy/runtime only.

## Legacy note

Legacy Firestore / `createJob` / old function-path flow is no longer the active user path. The shared API plus SQL-backed jobs are the canonical runtime. Old Firestore/function resources may still exist for rollback history, but they are not the primary path the repo should optimize around.

## Safe `prod -> dev-cloud` config sync

Use this only when you need deploy-shaped parity for testing:

```bash
pnpm env:render:dev-cloud
```

What the render step does:

- reads live Cloud Run config from `moads-api`
- reads dev-specific secrets from Secret Manager where available
- rewrites runtime values into `.env.dev-cloud.local`
- defaults `MOTREND_PROVIDER_MODE=manual` so real Kling calls do not start accidentally

What it rewrites on purpose:

- `MOADS_ENV=prod` -> `MOADS_ENV=dev-cloud`
- prod API base URL -> `https://api-dev.moads.agency`
- prod cookie name -> `moads_session_dev`
- prod queue names -> `motrend-submit` / `motrend-poll` / `motrend-download`
- prod database secret -> `MOADS_API_DEV_DATABASE_URL`
- prod session secret -> `SESSION_COOKIE_SECRET_DEV` when it exists

What it does not do:

- it does not deploy anything
- it does not mutate Cloud Run, Cloud SQL, Secret Manager, or queues
- it does not copy the prod database URL into local files
- it does not force provider mode to `kling`

If you intentionally need a real provider smoke in `dev-cloud`, opt in explicitly:

```bash
REAL_PROVIDER_MODE=kling pnpm env:render:dev-cloud
```
