# FastSpring AEO Phase 1 Operator Checklist

Date: 2026-03-31  
Scope: `Free + Pack S / Pack M / Pack L` only  
Subscriptions: deferred (`Starter / Pro / Store` are not live billing in this phase)

## 1. FastSpring API credentials

In FastSpring App:

1. Open `Developer Tools`.
2. Open `APIs`.
3. Open `API Credentials`.
4. Click `Create`.
5. Save these values for backend secrets:
   - `FS_API_USERNAME`
   - `FS_API_PASSWORD`
   - `FS_STORE_HOST`

Recommended `FS_STORE_HOST` format:
- `your-store.onfastspring.com`
- or `your-store.fastspring.com`

## 2. One-time products for AEO packs

In FastSpring App:

1. Open `Catalog`.
2. Open `One-Time Products`.
3. For each pack, either verify an existing product or click `Create Product`.

Target products:

| Pack | Internal code | FastSpring product path | Price |
| --- | --- | --- | --- |
| Pack S | `aeo_pack_s` | `aeo-pack-s` | `4.99 USD` |
| Pack M | `aeo_pack_m` | `aeo-pack-m` | `9.99 USD` |
| Pack L | `aeo_pack_l` | `aeo-pack-l` | `19.99 USD` |

Minimum fields to verify:
- Display Name
- Product Path
- Unit Price
- Currency = `USD`

Current FastSpring catalog check confirms these AEO paths exist:
- `aeo-pack-s`
- `aeo-pack-m`
- `aeo-pack-l`

## 3. Webhook

In FastSpring App:

1. Open `Developer Tools`.
2. Open `Webhooks`.
3. Open `Configuration`.
4. Click `Add Webhook`.
5. Use:
   - Title: `MOADS AEO Billing`
   - Get webhooks from: `Live and Test Orders`
6. Inside the webhook, click `Add URL Endpoint`.
7. Set:
   - URL: `https://api.moads.agency/v1/billing/webhooks/fastspring`
   - Event: `order.completed`
8. Leave HMAC secret empty in this phase.

Reason:
- backend confirms the order via FastSpring API before fulfillment,
- HMAC hardening can be added in a later security pass.

## 4. Repo/runtime values to provide or verify

The backend can proceed only after these values are known:

- `FS_API_USERNAME`
- `FS_API_PASSWORD`
- `FS_STORE_HOST`
- exact product path for:
  - `Pack S`
  - `Pack M`
  - `Pack L`

Optional runtime override:
- `AEO_CREDIT_PACKS_JSON`

This allows explicit mapping if FastSpring paths differ from defaults.

## 5. Terminal commands after FastSpring setup

Local:

```bash
pnpm billing:aeo-credit-packs:upsert:local
```

Dev cloud:

```bash
pnpm billing:aeo-credit-packs:upsert:dev-cloud
```

Prod:

```bash
pnpm billing:aeo-credit-packs:upsert:prod
```

Then deploy API:

```bash
pnpm cloud-run:deploy:prod
```

## 6. Smoke test

Expected sequence:

1. Sign in.
2. Open `https://lab.moads.agency/center`.
3. Click `Buy Pack S`.
4. Confirm redirect to FastSpring checkout.
5. Complete test order.
6. Wait for webhook.
7. Check:
   - local billing order becomes paid,
   - wallet credits increase exactly once,
   - duplicate webhook does not double-grant.

## 7. When Codex must stop and ask the user

Codex must stop immediately if any of these are missing:

- FastSpring login/dashboard access
- `FS_API_USERNAME`
- `FS_API_PASSWORD`
- `FS_STORE_HOST`
- exact product paths for AEO packs
- webhook not yet created in FastSpring
- product not found and must be created manually
