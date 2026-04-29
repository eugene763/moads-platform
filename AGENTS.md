# AGENTS.md — MO Ads / MoTrend working rules

Default workflow:
- Work locally first.
- Do not touch prod unless explicitly asked.
- Do not deploy unless explicitly asked.
- Do not switch to dev-cloud silently.
- Always explain plan before editing.
- Always show changed files and diff summary after editing.

Backend/platform repo:
- /Users/malevich/Documents/Playground/moads-platform

Frontend repo:
- /Users/malevich/Documents/Playground/motrend

Canonical GCP/Firebase project:
- gen-lang-client-0651837818

Safe local backend commands:
- pnpm install
- pnpm db:start:local
- pnpm db:generate
- pnpm db:validate
- pnpm db:push
- pnpm db:seed
- pnpm firebase:emulators:start
- pnpm dev

Safe checks:
- pnpm typecheck
- pnpm test

Dev-cloud commands only when explicitly requested:
- pnpm env:render:dev-cloud
- pnpm db:validate:dev-cloud
- pnpm db:sync:managed:dev-cloud
- pnpm cloud-tasks:ensure:dev-cloud
- pnpm cloud-run:deploy:dev-cloud

Never:
- do not deploy prod without explicit confirmation
- do not edit .env files without asking
- do not commit secrets
- do not paste auth tokens
- do not change billing/provider mode without asking

# Current AEO product override

Full-site scan is mandatory.

Older AEO specs may say that full-site scan is out of scope for v1. That is outdated.

Do not remove, downgrade, hide, or postpone full-site scan functionality.

Current AEO must support:
- page-level scan
- full-site / site-level scan
- scan history
- authenticated access to scan details
- clear issue details and recommendations
- stable unlock flow for authenticated users

Do not deploy to prod unless explicitly asked.
Do not touch prod unless explicitly asked.
Do not silently switch from local to dev-cloud.
Always explain plan before editing.