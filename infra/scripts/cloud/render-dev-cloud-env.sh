#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env.dev-cloud.local}"
BACKUP_FILE="${BACKUP_FILE:-${ENV_FILE}.bak}"

PROJECT_ID="${PROJECT_ID:-gen-lang-client-0651837818}"
REGION="${REGION:-us-central1}"
SOURCE_SERVICE="${SOURCE_SERVICE:-moads-api}"
TARGET_SERVICE="${TARGET_SERVICE:-moads-api-dev}"

DEV_API_BASE_URL="${DEV_API_BASE_URL:-https://api-dev.moads.agency}"
DEV_COOKIE_NAME="${DEV_COOKIE_NAME:-moads_session_dev}"
DEV_ALLOWED_ORIGINS="${DEV_ALLOWED_ORIGINS:-http://127.0.0.1:3000,http://localhost:3000,https://*.web.app,https://*.firebaseapp.com,https://lab-dev.moads.agency,https://aeo-dev.moads.agency,https://ugc-dev.moads.agency}"
DEV_SUBMIT_QUEUE="${DEV_SUBMIT_QUEUE:-motrend-submit}"
DEV_POLL_QUEUE="${DEV_POLL_QUEUE:-motrend-poll}"
DEV_DOWNLOAD_QUEUE="${DEV_DOWNLOAD_QUEUE:-motrend-download}"
DEV_DATABASE_SECRET_NAME="${DEV_DATABASE_SECRET_NAME:-MOADS_API_DEV_DATABASE_URL}"
DEV_SESSION_SECRET_NAME="${DEV_SESSION_SECRET_NAME:-SESSION_COOKIE_SECRET_DEV}"
DEV_DODO_API_KEY_SECRET_NAME="${DEV_DODO_API_KEY_SECRET_NAME:-DODO_API_KEY_DEV}"
DEV_DODO_WEBHOOK_KEY_SECRET_NAME="${DEV_DODO_WEBHOOK_KEY_SECRET_NAME:-DODO_WEBHOOK_KEY_DEV}"
DEV_DODO_WEBHOOK_SECRET_NAME="${DEV_DODO_WEBHOOK_SECRET_NAME:-DODO_WEBHOOK_SECRET_DEV}"
REAL_PROVIDER_MODE="${REAL_PROVIDER_MODE:-manual}"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

service_env_value() {
  local json_file="$1"
  local key="$2"

  node -e '
    const fs = require("fs");
    const [jsonFile, envName] = process.argv.slice(1);
    const doc = JSON.parse(fs.readFileSync(jsonFile, "utf8"));
    const env = (((doc.spec || {}).template || {}).spec || {}).containers?.[0]?.env ?? [];
    const match = env.find((entry) => entry.name === envName && typeof entry.value === "string");
    if (match) {
      process.stdout.write(match.value);
    }
  ' "$json_file" "$key"
}

service_account_name() {
  local json_file="$1"

  node -e '
    const fs = require("fs");
    const [jsonFile] = process.argv.slice(1);
    const doc = JSON.parse(fs.readFileSync(jsonFile, "utf8"));
    const value = (((doc.spec || {}).template || {}).spec || {}).serviceAccountName ?? "";
    process.stdout.write(value);
  ' "$json_file"
}

first_non_empty() {
  local value

  for value in "$@"; do
    if [[ -n "$value" ]]; then
      printf '%s' "$value"
      return 0
    fi
  done
}

secret_exists() {
  local secret_name="$1"
  gcloud secrets describe "$secret_name" --project "$PROJECT_ID" >/dev/null 2>&1
}

fetch_secret() {
  local secret_name="$1"
  gcloud secrets versions access latest --project "$PROJECT_ID" --secret "$secret_name"
}

write_kv() {
  local key="$1"
  local value="${2-}"
  printf '%s=%s\n' "$key" "$value" >> "$TMP_ENV_FILE"
}

require_command gcloud
require_command node

SOURCE_JSON="$(mktemp)"
TARGET_JSON="$(mktemp)"
TMP_ENV_FILE="$(mktemp)"

cleanup() {
  rm -f "$SOURCE_JSON" "$TARGET_JSON" "$TMP_ENV_FILE"
}

trap cleanup EXIT

gcloud run services describe "$SOURCE_SERVICE" \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --format=json >"$SOURCE_JSON"

if ! gcloud run services describe "$TARGET_SERVICE" \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --format=json >"$TARGET_JSON" 2>/dev/null; then
  printf '{}' >"$TARGET_JSON"
fi

if ! secret_exists "$DEV_SESSION_SECRET_NAME"; then
  DEV_SESSION_SECRET_NAME="SESSION_COOKIE_SECRET"
fi

if ! secret_exists "$DEV_DODO_API_KEY_SECRET_NAME"; then
  DEV_DODO_API_KEY_SECRET_NAME="DODO_API_KEY"
fi

if ! secret_exists "$DEV_DODO_WEBHOOK_KEY_SECRET_NAME"; then
  DEV_DODO_WEBHOOK_KEY_SECRET_NAME="DODO_WEBHOOK_KEY"
fi

if ! secret_exists "$DEV_DODO_WEBHOOK_SECRET_NAME"; then
  DEV_DODO_WEBHOOK_SECRET_NAME="DODO_WEBHOOK_SECRET"
fi

required_secrets=(
  "$DEV_SESSION_SECRET_NAME"
  "$DEV_DATABASE_SECRET_NAME"
  "KLING_ACCESS_KEY"
  "KLING_SECRET_KEY"
)

for secret_name in "${required_secrets[@]}"; do
  if ! secret_exists "$secret_name"; then
    echo "Required secret missing: $secret_name" >&2
    exit 1
  fi
done

PORT_VALUE="$(first_non_empty \
  "$(service_env_value "$TARGET_JSON" PORT)" \
  "$(service_env_value "$SOURCE_JSON" PORT)" \
  "8080")"

SESSION_COOKIE_DOMAIN_VALUE="$(first_non_empty \
  "$(service_env_value "$SOURCE_JSON" SESSION_COOKIE_DOMAIN)" \
  "$(service_env_value "$TARGET_JSON" SESSION_COOKIE_DOMAIN)" \
  ".moads.agency")"

SESSION_COOKIE_MAX_AGE_VALUE="$(first_non_empty \
  "$(service_env_value "$SOURCE_JSON" SESSION_COOKIE_MAX_AGE_MS)" \
  "$(service_env_value "$TARGET_JSON" SESSION_COOKIE_MAX_AGE_MS)" \
  "432000000")"

DEFAULT_DEV_PRODUCT_CODE_VALUE="$(first_non_empty \
  "$(service_env_value "$SOURCE_JSON" DEFAULT_DEV_PRODUCT_CODE)" \
  "$(service_env_value "$TARGET_JSON" DEFAULT_DEV_PRODUCT_CODE)" \
  "motrend")"

FIREBASE_PROJECT_ID_VALUE="$(first_non_empty \
  "$(service_env_value "$SOURCE_JSON" FIREBASE_PROJECT_ID)" \
  "$(service_env_value "$TARGET_JSON" FIREBASE_PROJECT_ID)" \
  "$PROJECT_ID")"

FIREBASE_STORAGE_BUCKET_VALUE="$(first_non_empty \
  "$(service_env_value "$SOURCE_JSON" FIREBASE_STORAGE_BUCKET)" \
  "$(service_env_value "$TARGET_JSON" FIREBASE_STORAGE_BUCKET)" \
  "$PROJECT_ID.firebasestorage.app")"

INTERNAL_API_KEY_VALUE="$(first_non_empty \
  "$(service_env_value "$TARGET_JSON" INTERNAL_API_KEY)" \
  "$(service_env_value "$SOURCE_JSON" INTERNAL_API_KEY)")"

TASK_DISPATCH_MODE_VALUE="$(first_non_empty \
  "$(service_env_value "$SOURCE_JSON" TASK_DISPATCH_MODE)" \
  "$(service_env_value "$TARGET_JSON" TASK_DISPATCH_MODE)" \
  "cloud-tasks")"

TASK_DISPATCH_TIMEOUT_VALUE="$(first_non_empty \
  "$(service_env_value "$SOURCE_JSON" TASK_DISPATCH_TIMEOUT_MS)" \
  "$(service_env_value "$TARGET_JSON" TASK_DISPATCH_TIMEOUT_MS)" \
  "5000")"

CLOUD_TASKS_PROJECT_ID_VALUE="$(first_non_empty \
  "$(service_env_value "$SOURCE_JSON" CLOUD_TASKS_PROJECT_ID)" \
  "$(service_env_value "$TARGET_JSON" CLOUD_TASKS_PROJECT_ID)" \
  "$PROJECT_ID")"

CLOUD_TASKS_LOCATION_VALUE="$(first_non_empty \
  "$(service_env_value "$SOURCE_JSON" CLOUD_TASKS_LOCATION)" \
  "$(service_env_value "$TARGET_JSON" CLOUD_TASKS_LOCATION)" \
  "$REGION")"

SOURCE_SERVICE_ACCOUNT_VALUE="$(service_account_name "$SOURCE_JSON")"
TARGET_SERVICE_ACCOUNT_VALUE="$(service_account_name "$TARGET_JSON")"
CLOUD_TASKS_INVOKER_VALUE="$(first_non_empty \
  "$(service_env_value "$TARGET_JSON" CLOUD_TASKS_INVOKER_SERVICE_ACCOUNT_EMAIL)" \
  "$(service_env_value "$SOURCE_JSON" CLOUD_TASKS_INVOKER_SERVICE_ACCOUNT_EMAIL)" \
  "$TARGET_SERVICE_ACCOUNT_VALUE" \
  "$SOURCE_SERVICE_ACCOUNT_VALUE")"

MOTREND_PROVIDER_POLL_DELAY_VALUE="$(first_non_empty \
  "$(service_env_value "$SOURCE_JSON" MOTREND_PROVIDER_POLL_DELAY_MS)" \
  "$(service_env_value "$TARGET_JSON" MOTREND_PROVIDER_POLL_DELAY_MS)" \
  "2000")"

MOTREND_STUB_OUTPUT_URL_VALUE="$(first_non_empty \
  "$(service_env_value "$SOURCE_JSON" MOTREND_STUB_OUTPUT_URL)" \
  "$(service_env_value "$TARGET_JSON" MOTREND_STUB_OUTPUT_URL)")"

KLING_BASE_URL_VALUE="$(first_non_empty \
  "$(service_env_value "$SOURCE_JSON" KLING_BASE_URL)" \
  "$(service_env_value "$TARGET_JSON" KLING_BASE_URL)" \
  "https://api-singapore.klingai.com")"

KLING_HTTP_TIMEOUT_VALUE="$(first_non_empty \
  "$(service_env_value "$SOURCE_JSON" KLING_HTTP_TIMEOUT_MS)" \
  "$(service_env_value "$TARGET_JSON" KLING_HTTP_TIMEOUT_MS)" \
  "20000")"

DATABASE_URL_VALUE="$(fetch_secret "$DEV_DATABASE_SECRET_NAME")"
SESSION_COOKIE_SECRET_VALUE="$(fetch_secret "$DEV_SESSION_SECRET_NAME")"
KLING_ACCESS_KEY_VALUE="$(fetch_secret "KLING_ACCESS_KEY")"
KLING_SECRET_KEY_VALUE="$(fetch_secret "KLING_SECRET_KEY")"
DODO_API_KEY_VALUE=""
DODO_WEBHOOK_KEY_VALUE=""

if secret_exists "$DEV_DODO_API_KEY_SECRET_NAME"; then
  DODO_API_KEY_VALUE="$(fetch_secret "$DEV_DODO_API_KEY_SECRET_NAME")"
fi

if secret_exists "$DEV_DODO_WEBHOOK_KEY_SECRET_NAME"; then
  DODO_WEBHOOK_KEY_VALUE="$(fetch_secret "$DEV_DODO_WEBHOOK_KEY_SECRET_NAME")"
elif secret_exists "$DEV_DODO_WEBHOOK_SECRET_NAME"; then
  DODO_WEBHOOK_KEY_VALUE="$(fetch_secret "$DEV_DODO_WEBHOOK_SECRET_NAME")"
fi

if [[ -f "$ENV_FILE" ]]; then
  cp "$ENV_FILE" "$BACKUP_FILE"
fi

: >"$TMP_ENV_FILE"

write_kv "MOADS_ENV" "dev-cloud"
write_kv "NODE_ENV" "production"
write_kv "PORT" "$PORT_VALUE"
write_kv "DATABASE_URL" "$DATABASE_URL_VALUE"
write_kv "SESSION_COOKIE_NAME" "$DEV_COOKIE_NAME"
write_kv "SESSION_COOKIE_DOMAIN" "$SESSION_COOKIE_DOMAIN_VALUE"
write_kv "SESSION_COOKIE_MAX_AGE_MS" "$SESSION_COOKIE_MAX_AGE_VALUE"
write_kv "SESSION_COOKIE_SECRET" "$SESSION_COOKIE_SECRET_VALUE"
write_kv "DEFAULT_DEV_PRODUCT_CODE" "$DEFAULT_DEV_PRODUCT_CODE_VALUE"
write_kv "API_ALLOWED_ORIGINS" "$DEV_ALLOWED_ORIGINS"
write_kv "API_BASE_URL" "$DEV_API_BASE_URL"
write_kv "FIREBASE_PROJECT_ID" "$FIREBASE_PROJECT_ID_VALUE"
write_kv "FIREBASE_STORAGE_BUCKET" "$FIREBASE_STORAGE_BUCKET_VALUE"
write_kv "FIREBASE_AUTH_EMULATOR_HOST" ""
write_kv "FIREBASE_STORAGE_EMULATOR_HOST" ""
write_kv "FIREBASE_SERVICE_ACCOUNT_JSON" ""
write_kv "GOOGLE_APPLICATION_CREDENTIALS" ""

if [[ -n "$INTERNAL_API_KEY_VALUE" ]]; then
  write_kv "INTERNAL_API_KEY" "$INTERNAL_API_KEY_VALUE"
fi

write_kv "TASK_DISPATCH_MODE" "$TASK_DISPATCH_MODE_VALUE"
write_kv "TASK_DISPATCH_TIMEOUT_MS" "$TASK_DISPATCH_TIMEOUT_VALUE"
write_kv "CLOUD_TASKS_PROJECT_ID" "$CLOUD_TASKS_PROJECT_ID_VALUE"
write_kv "CLOUD_TASKS_LOCATION" "$CLOUD_TASKS_LOCATION_VALUE"
write_kv "CLOUD_TASKS_MOTREND_SUBMIT_QUEUE" "$DEV_SUBMIT_QUEUE"
write_kv "CLOUD_TASKS_MOTREND_POLL_QUEUE" "$DEV_POLL_QUEUE"
write_kv "CLOUD_TASKS_MOTREND_DOWNLOAD_QUEUE" "$DEV_DOWNLOAD_QUEUE"
write_kv "CLOUD_TASKS_INVOKER_SERVICE_ACCOUNT_EMAIL" "$CLOUD_TASKS_INVOKER_VALUE"
write_kv "DODO_API_KEY" "$DODO_API_KEY_VALUE"
write_kv "DODO_WEBHOOK_KEY" "$DODO_WEBHOOK_KEY_VALUE"
write_kv "DODO_ENVIRONMENT" "test_mode"
write_kv "DODO_BASE_URL" ""
write_kv "MOTREND_PROVIDER_MODE" "$REAL_PROVIDER_MODE"
write_kv "MOTREND_PROVIDER_POLL_DELAY_MS" "$MOTREND_PROVIDER_POLL_DELAY_VALUE"
write_kv "MOTREND_STUB_OUTPUT_URL" "$MOTREND_STUB_OUTPUT_URL_VALUE"
write_kv "MOTREND_CREDIT_PACKS_JSON" ""
write_kv "KLING_ACCESS_KEY" "$KLING_ACCESS_KEY_VALUE"
write_kv "KLING_SECRET_KEY" "$KLING_SECRET_KEY_VALUE"
write_kv "KLING_BASE_URL" "$KLING_BASE_URL_VALUE"
write_kv "KLING_HTTP_TIMEOUT_MS" "$KLING_HTTP_TIMEOUT_VALUE"

mv "$TMP_ENV_FILE" "$ENV_FILE"

echo "Rendered dev-cloud env to $ENV_FILE"
if [[ -f "$BACKUP_FILE" ]]; then
  echo "Previous file backed up to $BACKUP_FILE"
fi
echo "Source service: $SOURCE_SERVICE"
echo "Target service: $TARGET_SERVICE"
echo "Provider mode: $REAL_PROVIDER_MODE"
