# AEO Tech Debt

Last updated: 2026-04-30

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

6. Remediate production dependency audit findings.
   - Owner: Platform/security.
   - Context: `pnpm audit --prod` reported critical/high advisories in production dependency paths, including Firebase/Firebase Admin, Fastify, Prisma transitive packages, Next/PostCSS, and Google Cloud transitive packages.
   - Suggested fix: Create a dedicated `security/dependency-audit-fixes` branch. Do not panic-upgrade directly on prod. Prioritize critical/high advisories first, then moderate advisories. Upgrade Next, Fastify, Firebase/Firebase Admin, Prisma/transitives carefully and run full typecheck/tests/build/smoke before any prod deploy.

7. Add explicit prod/dev deployment separation guards.
   - Owner: Platform.
   - Context: Release discipline should be branch- and environment-aware: `main` maps to prod, `develop` maps to dev-cloud. Prod Dodo must use `live_mode` only; dev Dodo must use `test_mode` only.
   - Suggested fix: Add deploy guards that print and validate target env, service, domain, database secret/instance, Firebase site, and Dodo environment before deployment. Block dev deploys from touching prod services/domains/databases and block prod deploys with test Dodo config.

8. Add site type classification before recommendations.
   - Owner: Backend/AEO.
   - Context: The scanner must classify site type before generating recommendations so output is relevant and does not recommend commerce-specific fixes on non-commerce sites.
   - Suggested fix: Add deterministic classification first, with AI explanation later. Supported site types should include ecommerce / Shopify / WooCommerce, SaaS landing page, agency/service website, blog/media, documentation/knowledge base, marketplace/catalog, local business, and portfolio/personal brand. Store a site-type confidence score and explain which evidence caused the inference.

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

8. Make recommendations strategy site-type aware.
   - Owner: Backend/AEO + Product.
   - Context: Recommendations should depend on site type rather than one generic rule stack.
   - Suggested fix: Do not recommend Product/AggregateRating on non-commerce sites. Ecommerce should prioritize Product schema, real AggregateRating only when reviews exist, category/product crawlability, merchant trust, and shipping/returns/payment policy visibility. SaaS should prioritize SoftwareApplication schema, pricing, use cases, comparisons, integrations, and FAQ. Agency/service sites should prioritize Service/Organization schema, case studies, proof, team/contact trust, and service pages. Blog/media should prioritize Article/BlogPosting schema, author, dates, topical clusters, and citations.

9. Design Full Site Scan 2.0.
   - Owner: Backend/frontend/product.
   - Context: Current launch-mode site scan is intentionally capped and synchronous.
   - Suggested fix: Add cost estimate before run, explicit credit confirmation, progress bar in percent, scanned pages count, skipped pages count, phase labels, and partial scan warnings.

10. Add OpenAI beta wow layer with guardrails.
    - Owner: Backend/AEO/product.
    - Context: Deterministic scanner should remain the source of truth for evidence, scoring, and billing decisions.
    - Suggested fix: Use AI only to explain, prioritize, and format recommendations. Add strict cost limits, retries, prompt/version tracking, safety guardrails, and fallbacks when AI is unavailable.

11. Expand analytics and GTM server-side readiness.
    - Owner: Growth/platform.
    - Context: Analytics helper exists, but taxonomy and server-side event model are incomplete.
    - Suggested fix: Standardize `service_name`, `product_code`, and `service_env` fields. Add AEO funnel events, Dodo webhook-confirmed purchase events, credit grant/spend events, scan success/failure events, and share/auth events. Do not send raw PII.

12. Polish share and public report surfaces.
    - Owner: Frontend/product.
    - Context: Share behavior and public report previews are MVP-level.
    - Suggested fix: Add a unified share menu later with consistent Telegram, WhatsApp, email, SMS, native share, and clipboard copy. Keep public report metadata accurate and never leak private account data, email, wallet state, or internal scan IDs.

## Suggested Order

1. Dodo webhook tests and validation.
2. Dependency audit remediation branch.
3. Wallet/deploy/prod-dev safety guards.
4. AEO-only prod frontend deploy path.
5. Explicit dev noindex flag.
6. CI release gate.
7. Distributed public scan rate limiting.
8. Site type classification and recommendation strategy.
9. Analytics/GTM server-side event map.
10. Scanner evidence v2 and Full Site Scan 2.0.

## P1 — Site type detection and type-aware recommendations

The scanner must learn to classify the scanned website/page type before generating issues and recommendations.

Why:
- Current checks can over-recommend ecommerce-specific fixes such as Product/AggregateRating for pages that are not stores.
- AEO recommendations should depend on page/site archetype, not one universal checklist.

Target site/page types:
- Ecommerce / product store
- SaaS / B2B landing
- Agency / service business
- Blog / media / editorial
- Local business
- Portfolio / personal brand
- Documentation / help center
- Marketplace / catalog
- Event / community site
- Unknown / mixed

Required behavior:
- Detect likely type using structured data, URL patterns, visible content, navigation labels, product/cart signals, article signals, pricing/service sections, and schema types.
- Suppress irrelevant issues for the detected type.
- Prioritize fixes differently by type.
- Example: Product/AggregateRating should be high priority for product pages, but not for a SaaS homepage or agency landing page.
- Store detected type and confidence in scan result metadata.
- Show user-facing copy such as: "Detected site type: ecommerce / service / media / unknown."
- Allow fallback to generic AEO recommendations when confidence is low.

Implementation note:
- Keep deterministic detection first.
- AI-generated recommendations can later use detected site type as context, but should not be the only source of classification.
