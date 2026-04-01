# AEO Creem Cutover

## What changed in code

- Backend now supports `creem` checkout and webhook fulfillment for AEO credit packs.
- `POST /v1/lab/starter/checkout` still powers the live pack checkout action, but the selected billing price can now point to `creem`.
- `POST /v1/billing/webhooks/creem` verifies the signature and fulfills the local billing order idempotently.
- AEO credit pack seed/upsert logic is now provider-aware:
  - `creemProductId` -> preferred Creem checkout path
  - `fastspringProductPath` -> legacy fallback for older rows
- Existing FastSpring support remains in code so previously seeded or already-paid rows are not broken during cutover.

## Creem dashboard setup

Create three one-time products in Creem:

| Pack | Internal code | Credits | Price |
|---|---|---:|---:|
| Pack S | `aeo_pack_s` | 30 | `$4.99` |
| Pack M | `aeo_pack_m` | 80 | `$9.99` |
| Pack L | `aeo_pack_l` | 200 | `$19.99` |

For each product:
- copy the Creem product id
- expected format: `prod_...`

Create or copy in Creem:
- API key
- Webhook signing secret

Add webhook endpoints:
- Prod: `https://api.moads.agency/v1/billing/webhooks/creem`
- Dev: `https://api-dev.moads.agency/v1/billing/webhooks/creem`

Subscribe the webhook to:
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

## AEO pack config upsert

Use `AEO_CREDIT_PACKS_JSON` to map AEO packs to Creem product ids.

Example:

```bash
export AEO_CREDIT_PACKS_JSON='[
  {
    "code": "aeo_pack_s",
    "name": "Pack S",
    "creditsAmount": 30,
    "amountMinor": 499,
    "providerCode": "creem",
    "creemProductId": "prod_pack_s_123",
    "currencyCode": "USD",
    "marketCode": "global",
    "languageCode": "en"
  },
  {
    "code": "aeo_pack_m",
    "name": "Pack M",
    "creditsAmount": 80,
    "amountMinor": 999,
    "providerCode": "creem",
    "creemProductId": "prod_pack_m_123",
    "currencyCode": "USD",
    "marketCode": "global",
    "languageCode": "en"
  },
  {
    "code": "aeo_pack_l",
    "name": "Pack L",
    "creditsAmount": 200,
    "amountMinor": 1999,
    "providerCode": "creem",
    "creemProductId": "prod_pack_l_123",
    "currencyCode": "USD",
    "marketCode": "global",
    "languageCode": "en"
  }
]'

pnpm --dir /Users/malevich/Documents/Playground/moads-platform billing:aeo-credit-packs:upsert:prod
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

1. Open `https://lab.moads.agency/center`
2. Sign in with an internal account
3. Open `AEO Credit Packs`
4. Click any pack
5. Confirm redirect host ends with `creem.io`
6. Complete the checkout
7. Return to LAB/AEO
8. Confirm:
   - wallet balance increases once
   - recent order appears as `paid`
   - no duplicate credits are granted on repeated webhook delivery

## Notes

- The frontend success flow is generic and already watches `?checkout=complete`.
- Creem webhook fulfillment is idempotent through the billing order fulfillment path.
- If `AEO_CREDIT_PACKS_JSON` is not set, AEO defaults can still fall back to legacy FastSpring references until Creem product ids are provided.
