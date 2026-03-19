# MoTrend Migration Notes

## Phase 1

- Keep the current Firebase-hosted frontend in the legacy `motrend` repo.
- Move source of truth for auth, wallet, memberships, jobs, support profile, and attribution into PostgreSQL.
- Preserve direct browser uploads to Firebase Storage.

## Frontend contract changes

- Replace Firebase callable bootstrap logic with:
  - `POST /auth/session-login`
  - `GET /auth/me`
  - `GET /motrend/me`
- Replace gift-alert heuristics with the backend `grantedTestCredits` flag.
- Keep existing mobile-first UX, active-job lock expectations, and dedicated save/download flows.
