# MoTrend Creem Cutover

## What changed in code

- Backend now supports `creem` as a billing provider alongside existing providers.
- `POST /billing/orders/checkout` can create a Creem checkout session when the selected price uses provider `creem`.
- `POST /billing/webhooks/creem` verifies the webhook signature and fulfills the local billing order idempotently.
- Wallet redirect allowlist on the MoTrend frontend now accepts `*.creem.io`.
- The frontend already supports returning to the cabinet with `?checkout=complete` and will refresh balance/orders after payment.

## Creem dashboard setup

1. Create three one-time products in Creem:
   - `Starter` -> `30 credits`
   - `Creator` -> `80 credits`
   - `Pro` -> `200 credits`
2. Copy the Creem product ids for each pack.
   - Expected format: `prod_...`
3. Create or copy:
   - API key
   - Webhook signing secret
4. Add a webhook endpoint in Creem:
   - Prod: `https://api.moads.agency/billing/webhooks/creem`
   - Dev: `https://api-dev.moads.agency/billing/webhooks/creem`
5. Subscribe the webhook to:
   - `checkout.completed`

## GCP secrets

Create/update these secrets in project `gen-lang-client-0651837818`:

```bash
printf '%s' 'CREEM_API_KEY_VALUE' | gcloud secrets create CREEM_API_KEY --project gen-lang-client-0651837818 --data-file=-
printf '%s' 'CREEM_WEBHOOK_SECRET_VALUE' | gcloud secrets create CREEM_WEBHOOK_SECRET --project gen-lang-client-0651837818 --data-file=-
```

If the secret already exists, use:

```bash
printf '%s' 'CREEM_API_KEY_VALUE' | gcloud secrets versions add CREEM_API_KEY --project gen-lang-client-0651837818 --data-file=-
printf '%s' 'CREEM_WEBHOOK_SECRET_VALUE' | gcloud secrets versions add CREEM_WEBHOOK_SECRET --project gen-lang-client-0651837818 --data-file=-
```

Optional API base URL overrides:

- Prod default: `https://api.creem.io`
- Dev/local default: `https://test-api.creem.io`

Only set `CREEM_API_BASE_URL` if you need to override the runtime default.

## Pack config upsert

Use `MOTREND_CREDIT_PACKS_JSON` to map MoTrend packs to Creem product ids.

Example:

```bash
export MOTREND_CREDIT_PACKS_JSON='[
  {
    "code": "motrend_credits_starter",
    "name": "Starter",
    "creditsAmount": 30,
    "amountMinor": 499,
    "providerCode": "creem",
    "creemProductId": "prod_starter_123",
    "currencyCode": "USD",
    "marketCode": "global",
    "languageCode": "en"
  },
  {
    "code": "motrend_credits_creator",
    "name": "Creator",
    "creditsAmount": 80,
    "amountMinor": 999,
    "providerCode": "creem",
    "creemProductId": "prod_creator_123",
    "currencyCode": "USD",
    "marketCode": "global",
    "languageCode": "en"
  },
  {
    "code": "motrend_credits_pro",
    "name": "Pro",
    "creditsAmount": 200,
    "amountMinor": 1999,
    "providerCode": "creem",
    "creemProductId": "prod_pro_123",
    "currencyCode": "USD",
    "marketCode": "global",
    "languageCode": "en"
  }
]'

pnpm --dir /Users/malevich/Documents/Playground/moads-platform tsx \
  /Users/malevich/Documents/Playground/moads-platform/infra/scripts/upsert-motrend-credit-packs.ts
```

## Deploy

### Dev

```bash
cd /Users/malevich/Documents/Playground/moads-platform
CREEM_API_BASE_URL=https://test-api.creem.io ./infra/scripts/cloud/deploy-moads-api-dev.sh
```

### Prod

```bash
cd /Users/malevich/Documents/Playground/moads-platform
./infra/scripts/cloud/deploy-moads-api-prod.sh
```

## Smoke test

1. Open `trend.moads.agency`
2. Sign in with an internal account
3. Open wallet
4. Choose a pack
5. Confirm redirect host ends with `creem.io`
6. Complete the purchase
7. Return to the MoTrend tab
8. Confirm:
   - wallet balance increases once
   - recent order appears as `paid`
   - a success notice appears

## Notes

- The frontend success flow is generic and already watches `?checkout=complete`.
- Creem webhook fulfillment is idempotent through `billing_order_paid:<orderId>`.
- Existing FastSpring support remains in code so AEO or older billing rows are not broken during migration.
