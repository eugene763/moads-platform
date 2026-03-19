# motrend-web

This workspace stays intentionally lightweight during Phase 1.

## Current strategy

- Keep the production frontend in the legacy repository for now.
- Migrate backend contracts first: auth bootstrap, profile, jobs, credits, and download preparation.
- When the frontend starts consuming the new API, use `POST /auth/session-login` bootstrap flags to decide whether to show the gift notice.

## Gift-notice rule

Never show the promo notice based on Firebase `isNewUser` alone.

Use the `grantedTestCredits` flag from `session-login` so existing MoTrend users do not see false gift alerts.
