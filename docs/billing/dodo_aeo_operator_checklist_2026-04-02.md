# Dodo Payments AEO Operator Checklist

## Scope
- This checklist wires **AEO credit packs** to Dodo Payments.
- Current launch model stays:
  - `Free` = free public scan + auth unlock
  - `Pack S / M / L` = one-time paid credit packs
  - `Starter / Pro / Store` = not live in checkout yet

## 1. Create AEO one-time products in Dodo
In the Dodo Payments dashboard, create **three separate one-time products**.

Recommended products:

| Product | Internal code | Price | Credits | Pricing model |
| --- | --- | ---: | ---: | --- |
| Pack S | `aeo_pack_s` | `$4.99` | `30` | One-time |
| Pack M | `aeo_pack_m` | `$9.99` | `80` | One-time |
| Pack L | `aeo_pack_l` | `$19.99` | `200` | One-time |

Recommended naming:
- `Pack S`
- `Pack M`
- `Pack L`

Recommended description pattern:
- `30 AEO credits for AI tips and usage-based actions`
- `80 AEO credits for AI tips and usage-based actions`
- `200 AEO credits for AI tips and usage-based actions`

What matters for the integration:
- each product must be a **one-time** product,
- each product must return a **product id** in Dodo,
- we will save those ids into MO Ads billing prices as `externalPriceId`.

After creation, copy the three Dodo product ids.

## 2. Create webhook endpoint in Dodo
In the Dodo Payments dashboard:

1. Go to `Settings -> Webhooks`
2. Add a new endpoint
3. Set URL to:

```text
https://api.moads.agency/v1/billing/webhooks/dodo
```

4. Limit the event filter to:

```text
payment.succeeded
```

5. Save the endpoint
6. Copy the webhook signing secret / webhook key for this endpoint

The backend now verifies Dodo webhook signatures using the official Dodo SDK and the raw request body.

## 3. Store secrets in GCP
Required secrets:
- `DODO_API_KEY`
- `DODO_WEBHOOK_KEY`

Create the webhook secret if it does not exist yet:

```bash
gcloud secrets describe DODO_WEBHOOK_KEY --project gen-lang-client-0651837818 >/dev/null 2>&1 || \
gcloud secrets create DODO_WEBHOOK_KEY --project gen-lang-client-0651837818 --replication-policy=automatic
```

Add or rotate the API key:

```bash
read -s DODO_API_KEY && echo
printf '%s' "$DODO_API_KEY" | gcloud secrets versions add DODO_API_KEY --data-file=- --project gen-lang-client-0651837818
unset DODO_API_KEY
```

Add or rotate the webhook key:

```bash
read -s DODO_WEBHOOK_KEY && echo
printf '%s' "$DODO_WEBHOOK_KEY" | gcloud secrets versions add DODO_WEBHOOK_KEY --data-file=- --project gen-lang-client-0651837818
unset DODO_WEBHOOK_KEY
```

## 4. Upsert AEO pack mapping to Dodo
Replace the placeholders below with the real Dodo product ids from step 1.

```bash
export AEO_CREDIT_PACKS_JSON='[
  {
    "code": "aeo_pack_s",
    "name": "Pack S",
    "creditsAmount": 30,
    "amountMinor": 499,
    "providerCode": "dodo",
    "dodoProductId": "pdt_replace_pack_s",
    "currencyCode": "USD",
    "marketCode": "global",
    "languageCode": "en"
  },
  {
    "code": "aeo_pack_m",
    "name": "Pack M",
    "creditsAmount": 80,
    "amountMinor": 999,
    "providerCode": "dodo",
    "dodoProductId": "pdt_replace_pack_m",
    "currencyCode": "USD",
    "marketCode": "global",
    "languageCode": "en"
  },
  {
    "code": "aeo_pack_l",
    "name": "Pack L",
    "creditsAmount": 200,
    "amountMinor": 1999,
    "providerCode": "dodo",
    "dodoProductId": "pdt_replace_pack_l",
    "currencyCode": "USD",
    "marketCode": "global",
    "languageCode": "en"
  }
]'
```

Then run:

```bash
pnpm --dir /Users/malevich/Documents/Playground/moads-platform billing:aeo-credit-packs:upsert:prod
```

## 5. Deploy API with the correct Dodo environment
For a first safe run, you can use **test mode**:

```bash
cd /Users/malevich/Documents/Playground/moads-platform
DODO_ENVIRONMENT=test_mode pnpm cloud-run:deploy:prod
```

For real payments, switch to **live mode**:

```bash
cd /Users/malevich/Documents/Playground/moads-platform
DODO_ENVIRONMENT=live_mode pnpm cloud-run:deploy:prod
```

Notes:
- the deploy scripts now automatically attach `DODO_API_KEY` and `DODO_WEBHOOK_KEY` when the secrets exist,
- Dodo checkout is enabled by provider mapping in the billing price rows,
- FastSpring remains as a fallback for any prices that still use the `fastspring` provider code.

## 6. Smoke test after deploy
Recommended order:

1. Sign in on:
   - `https://lab.moads.agency/center`
2. Buy `Pack S`
3. Confirm redirect goes to Dodo checkout
4. Complete a test payment
5. Confirm webhook hits:
   - `POST /v1/billing/webhooks/dodo`
6. Confirm wallet balance increases exactly once
7. Confirm order appears in LAB order history

## 7. Current backend contract
The current backend implementation expects:
- checkout creation via Dodo Checkout Sessions,
- metadata to include local billing order identifiers,
- webhook event:
  - `payment.succeeded`
- webhook headers:
  - `webhook-id`
  - `webhook-signature`
  - `webhook-timestamp`

The current live endpoint for Dodo webhook processing is:

```text
https://api.moads.agency/v1/billing/webhooks/dodo
```

## 8. What stays out of scope for this phase
- recurring subscriptions in Dodo,
- Starter / Pro / Store paid plans,
- GA4 / realtime provider billing,
- OpenAI billing changes,
- customer portal flows.

This phase is only:
- `Free + one-time packs via Dodo`.
