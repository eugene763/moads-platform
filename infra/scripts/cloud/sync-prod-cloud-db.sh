#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
PROJECT_ID="${PROJECT_ID:-gen-lang-client-0651837818}"
REGION="${REGION:-us-central1}"
INSTANCE_NAME="${INSTANCE_NAME:-moads-platform-prod}"
INSTANCE_CONNECTION_NAME="${INSTANCE_CONNECTION_NAME:-$PROJECT_ID:$REGION:$INSTANCE_NAME}"
PROXY_BIN="${PROXY_BIN:-/tmp/cloud-sql-proxy}"
PROXY_PORT="${PROXY_PORT:-55433}"
PROXY_AUTH_FLAG="${PROXY_AUTH_FLAG:---gcloud-auth}"
APP_PASSWORD_SECRET="${APP_PASSWORD_SECRET:-MOADS_PLATFORM_PROD_APP_PASSWORD}"
DB_USER="${DB_USER:-moads_app}"
DB_NAME="${DB_NAME:-moads_platform}"

if [[ ! -x "$PROXY_BIN" ]]; then
  os="$(uname -s | tr '[:upper:]' '[:lower:]')"
  arch="$(uname -m)"
  case "$arch" in
    arm64|aarch64)
      arch="arm64"
      ;;
    x86_64|amd64)
      arch="amd64"
      ;;
    *)
      echo "Unsupported architecture for Cloud SQL Proxy: $arch" >&2
      exit 1
      ;;
  esac
  curl -fsSL \
    "https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/v2.18.0/cloud-sql-proxy.${os}.${arch}" \
    -o "$PROXY_BIN"
  chmod +x "$PROXY_BIN"
fi

APP_PASSWORD="$(gcloud secrets versions access latest --secret "$APP_PASSWORD_SECRET" --project "$PROJECT_ID")"
DATABASE_URL="postgresql://${DB_USER}:${APP_PASSWORD}@127.0.0.1:${PROXY_PORT}/${DB_NAME}?schema=public"

"$PROXY_BIN" "$INSTANCE_CONNECTION_NAME" "$PROXY_AUTH_FLAG" --port "$PROXY_PORT" >/tmp/moads-cloud-sql-proxy-prod.log 2>&1 &
PROXY_PID=$!

cleanup() {
  kill "$PROXY_PID" >/dev/null 2>&1 || true
}
trap cleanup EXIT

for _ in $(seq 1 30); do
  if nc -z 127.0.0.1 "$PROXY_PORT" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if ! nc -z 127.0.0.1 "$PROXY_PORT" >/dev/null 2>&1; then
  echo "Cloud SQL Proxy failed to start. Check /tmp/moads-cloud-sql-proxy-prod.log" >&2
  exit 1
fi

cd "$ROOT_DIR"
DATABASE_URL="$DATABASE_URL" pnpm --filter @moads/db prisma db push
DATABASE_URL="$DATABASE_URL" pnpm --filter @moads/db db:seed
(
  cd "$ROOT_DIR/services/api"
  MOADS_ENV=prod \
    FIREBASE_PROJECT_ID="$PROJECT_ID" \
    DATABASE_URL="$DATABASE_URL" \
    pnpm exec tsx ../../infra/scripts/backfill-legacy-support-codes.ts
)
(
  cd "$ROOT_DIR/services/api"
  MOADS_ENV=prod \
    FIREBASE_PROJECT_ID="$PROJECT_ID" \
    DATABASE_URL="$DATABASE_URL" \
    pnpm exec tsx ../../infra/scripts/sync-legacy-motrend-templates.ts
)
