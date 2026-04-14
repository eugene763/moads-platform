# Dodo Payments AEO Operator Checklist

## Scope
- This checklist wires AEO credit packs to Dodo Payments.
- Current launch mode:
  - `Free` = free public scan
  - `Pack S / M / L` = one-time paid packs
  - `Starter / Pro / Store` = not live in checkout yet

## 1) Active AEO products in Dodo

Current mapped products:

| Product | Code | Credits | Price | Dodo product id |
| --- | --- | ---: | ---: | --- |
| Pack S | `aeo_pack_s` | 30 | `$4.99` | `pdt_0NcVKMKum3pnZI0k9W9GP` |
| Pack M | `aeo_pack_m` | 80 | `$9.99` | `pdt_0NcVKTv8PCbSE5KplPmSI` |
| Pack L | `aeo_pack_l` | 200 | `$19.99` | `pdt_0NcVKZ0msSsA9QJ8ZVzH6` |

Use the same Dodo business as Motrend unless you intentionally want separate merchant reporting and payouts.

## 2) Webhook setup

In Dodo:
1. Go to `Settings -> Webhooks`
2. Add endpoint:

```text
https://api.moads.agency/v1/billing/webhooks/dodo
```

3. Filter to event:

```text
payment.succeeded
```

4. Copy the webhook signing key / secret

## 3) Required GCP secrets

Required:
- `DODO_API_KEY`
- `DODO_WEBHOOK_KEY`

Optional but recommended for future AI tips:
- `OPENAI_API_KEY`

Create missing secrets:

```bash
gcloud secrets describe DODO_API_KEY --project gen-lang-client-0651837818 >/dev/null 2>&1 || \
gcloud secrets create DODO_API_KEY --project gen-lang-client-0651837818 --replication-policy=automatic

gcloud secrets describe DODO_WEBHOOK_KEY --project gen-lang-client-0651837818 >/dev/null 2>&1 || \
gcloud secrets create DODO_WEBHOOK_KEY --project gen-lang-client-0651837818 --replication-policy=automatic

gcloud secrets describe OPENAI_API_KEY --project gen-lang-client-0651837818 >/dev/null 2>&1 || \
gcloud secrets create OPENAI_API_KEY --project gen-lang-client-0651837818 --replication-policy=automatic
```

Rotate Dodo API key:

```bash
read -s DODO_API_KEY && echo
printf '%s' "$DODO_API_KEY" | gcloud secrets versions add DODO_API_KEY --data-file=- --project gen-lang-client-0651837818
unset DODO_API_KEY
```

Rotate Dodo webhook key:

```bash
read -s DODO_WEBHOOK_KEY && echo
printf '%s' "$DODO_WEBHOOK_KEY" | gcloud secrets versions add DODO_WEBHOOK_KEY --data-file=- --project gen-lang-client-0651837818
unset DODO_WEBHOOK_KEY
```

Add OpenAI API key when ready:

```bash
read -s OPENAI_API_KEY && echo
printf '%s' "$OPENAI_API_KEY" | gcloud secrets versions add OPENAI_API_KEY --data-file=- --project gen-lang-client-0651837818
unset OPENAI_API_KEY
```

## 4) Upsert AEO pack mapping

The current product ids are already known. The operator command is:

```bash
export AEO_CREDIT_PACKS_JSON='[
  {
    "code": "aeo_pack_s",
    "name": "Pack S",
    "creditsAmount": 30,
    "amountMinor": 499,
    "providerCode": "dodo",
    "dodoProductId": "pdt_0NcVKMKum3pnZI0k9W9GP",
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
    "dodoProductId": "pdt_0NcVKTv8PCbSE5KplPmSI",
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
    "dodoProductId": "pdt_0NcVKZ0msSsA9QJ8ZVzH6",
    "currencyCode": "USD",
    "marketCode": "global",
    "languageCode": "en"
  }
]'
pnpm --dir /Users/malevich/Documents/Playground/moads-platform billing:aeo-credit-packs:upsert:prod
```

## 5) Deploy contract

Launch mode deploy:

```bash
cd /Users/malevich/Documents/Playground/moads-platform
DODO_ENVIRONMENT=live_mode pnpm cloud-run:deploy:prod
pnpm cloud-frontends:deploy:pro
```

Notes:
- Dodo is the only active provider for AEO packs
- public scan does not require OpenAI
- OpenAI is only for optional AI tips

## 6) Smoke test

1. Sign in on `https://lab.moads.agency/center`
2. Buy `Pack S`
3. Confirm redirect goes to Dodo checkout
4. Complete payment
5. Confirm webhook hits:
   - `POST /v1/billing/webhooks/dodo`
6. Confirm wallet balance increments once
7. Confirm order is visible in LAB

## 7) OpenAI clarification

OpenAI setup requires:
- billing enabled in OpenAI Platform
- API key created
- key stored in `OPENAI_API_KEY`

OpenAI does not require:
- products
- assistants
- GPTs
- prompt objects

Public scan remains OpenAI-free.
