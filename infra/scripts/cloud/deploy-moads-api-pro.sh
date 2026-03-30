#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env.pro.local}"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  source "$ENV_FILE"
  set +a
fi

PROJECT_ID="${PROJECT_ID:-${FIREBASE_PROJECT_ID:-moads-pro}}"
REGION="${REGION:-${CLOUD_TASKS_LOCATION:-us-central1}}"
SERVICE_NAME="${SERVICE_NAME:-moads-api-pro}"
INSTANCE_NAME="${INSTANCE_NAME:-moads-platform-pro}"
INSTANCE_CONNECTION_NAME="${INSTANCE_CONNECTION_NAME:-$PROJECT_ID:$REGION:$INSTANCE_NAME}"
RUNTIME_SERVICE_ACCOUNT_EMAIL="${RUNTIME_SERVICE_ACCOUNT_EMAIL:-moads-api-pro-runtime@${PROJECT_ID}.iam.gserviceaccount.com}"
SESSION_COOKIE_SECRET_NAME="${SESSION_COOKIE_SECRET_NAME:-SESSION_COOKIE_SECRET_PRO}"
DATABASE_URL_SECRET_NAME="${DATABASE_URL_SECRET_NAME:-MOADS_API_PRO_DATABASE_URL}"
OPENAI_API_KEY_SECRET_NAME="${OPENAI_API_KEY_SECRET_NAME:-OPENAI_API_KEY}"

if [[ -z "$PROJECT_ID" ]]; then
  echo "PROJECT_ID (or FIREBASE_PROJECT_ID) is required." >&2
  exit 1
fi

required_secrets=(
  "$SESSION_COOKIE_SECRET_NAME"
  "$DATABASE_URL_SECRET_NAME"
)

for secret_name in "${required_secrets[@]}"; do
  if ! gcloud secrets describe "$secret_name" --project "$PROJECT_ID" >/dev/null 2>&1; then
    echo "Required secret missing: $secret_name" >&2
    exit 1
  fi
done

secret_flags=(
  "SESSION_COOKIE_SECRET=${SESSION_COOKIE_SECRET_NAME}:latest"
  "DATABASE_URL=${DATABASE_URL_SECRET_NAME}:latest"
)

if gcloud secrets describe "$OPENAI_API_KEY_SECRET_NAME" --project "$PROJECT_ID" >/dev/null 2>&1; then
  secret_flags+=("OPENAI_API_KEY=${OPENAI_API_KEY_SECRET_NAME}:latest")
fi

if [[ "${ATTACH_FIREBASE_SERVICE_ACCOUNT_SECRET:-false}" == "true" ]] && \
  gcloud secrets describe FIREBASE_SERVICE_ACCOUNT --project "$PROJECT_ID" >/dev/null 2>&1; then
  secret_flags+=("FIREBASE_SERVICE_ACCOUNT_JSON=FIREBASE_SERVICE_ACCOUNT:latest")
fi

env_pairs=(
  "MOADS_ENV=prod"
  "NODE_ENV=production"
  "SESSION_COOKIE_NAME=${SESSION_COOKIE_NAME:-moads_session_pro}"
  "SESSION_COOKIE_MAX_AGE_MS=${SESSION_COOKIE_MAX_AGE_MS:-1209600000}"
  "SESSION_COOKIE_DOMAIN=${SESSION_COOKIE_DOMAIN:-.moads.agency}"
  "DEFAULT_DEV_PRODUCT_CODE=${DEFAULT_DEV_PRODUCT_CODE:-aeo}"
  "API_ALLOWED_ORIGINS=${API_ALLOWED_ORIGINS:-https://aeo.moads.agency,https://lab.moads.agency}"
  "API_BASE_URL=${API_BASE_URL:-https://api.moads.agency}"
  "FIREBASE_PROJECT_ID=${FIREBASE_PROJECT_ID:-}"
  "FIREBASE_STORAGE_BUCKET=${FIREBASE_STORAGE_BUCKET:-}"
  "TASK_DISPATCH_MODE=${TASK_DISPATCH_MODE:-manual}"
  "TASK_DISPATCH_TIMEOUT_MS=${TASK_DISPATCH_TIMEOUT_MS:-5000}"
  "MOTREND_PROVIDER_MODE=${MOTREND_PROVIDER_MODE:-manual}"
  "MOTREND_PROVIDER_POLL_DELAY_MS=${MOTREND_PROVIDER_POLL_DELAY_MS:-2000}"
  "KLING_BASE_URL=${KLING_BASE_URL:-https://api-singapore.klingai.com}"
  "KLING_HTTP_TIMEOUT_MS=${KLING_HTTP_TIMEOUT_MS:-20000}"
  "AEO_PUBLIC_SCAN_RATE_LIMIT_PER_HOUR=${AEO_PUBLIC_SCAN_RATE_LIMIT_PER_HOUR:-60}"
  "AEO_PUBLIC_SCAN_CACHE_TTL_MS=${AEO_PUBLIC_SCAN_CACHE_TTL_MS:-86400000}"
  "AEO_AI_TIPS_MODE=${AEO_AI_TIPS_MODE:-mock}"
  "AEO_GA4_MODE=${AEO_GA4_MODE:-mock}"
  "AEO_REALTIME_MODE=${AEO_REALTIME_MODE:-mock}"
  "AEO_REALTIME_INTERVAL_MS=${AEO_REALTIME_INTERVAL_MS:-5000}"
  "AEO_AI_TIPS_MODEL=${AEO_AI_TIPS_MODEL:-gpt-5-mini}"
)

if [[ -n "${CLOUD_TASKS_PROJECT_ID:-}" ]]; then
  env_pairs+=("CLOUD_TASKS_PROJECT_ID=${CLOUD_TASKS_PROJECT_ID}")
fi
if [[ -n "${CLOUD_TASKS_LOCATION:-}" ]]; then
  env_pairs+=("CLOUD_TASKS_LOCATION=${CLOUD_TASKS_LOCATION}")
fi
if [[ -n "${CLOUD_TASKS_MOTREND_SUBMIT_QUEUE:-}" ]]; then
  env_pairs+=("CLOUD_TASKS_MOTREND_SUBMIT_QUEUE=${CLOUD_TASKS_MOTREND_SUBMIT_QUEUE}")
fi
if [[ -n "${CLOUD_TASKS_MOTREND_POLL_QUEUE:-}" ]]; then
  env_pairs+=("CLOUD_TASKS_MOTREND_POLL_QUEUE=${CLOUD_TASKS_MOTREND_POLL_QUEUE}")
fi
if [[ -n "${CLOUD_TASKS_MOTREND_DOWNLOAD_QUEUE:-}" ]]; then
  env_pairs+=("CLOUD_TASKS_MOTREND_DOWNLOAD_QUEUE=${CLOUD_TASKS_MOTREND_DOWNLOAD_QUEUE}")
fi
if [[ -n "${CLOUD_TASKS_INVOKER_SERVICE_ACCOUNT_EMAIL:-}" ]]; then
  env_pairs+=("CLOUD_TASKS_INVOKER_SERVICE_ACCOUNT_EMAIL=${CLOUD_TASKS_INVOKER_SERVICE_ACCOUNT_EMAIL}")
fi

secret_string="$(IFS=,; printf '%s' "${secret_flags[*]}")"
env_file="$(mktemp)"

cleanup() {
  rm -f "$env_file"
}
trap cleanup EXIT

for pair in "${env_pairs[@]}"; do
  key="${pair%%=*}"
  value="${pair#*=}"
  escaped_value="${value//\'/\'\'}"
  printf "%s: '%s'\n" "$key" "$escaped_value" >> "$env_file"
done

gcloud run deploy "$SERVICE_NAME" \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --source "$ROOT_DIR" \
  --allow-unauthenticated \
  --no-invoker-iam-check \
  --execution-environment gen2 \
  --cpu 1 \
  --memory 1Gi \
  --concurrency 80 \
  --min-instances 0 \
  --max-instances 6 \
  --service-account "$RUNTIME_SERVICE_ACCOUNT_EMAIL" \
  --ingress internal-and-cloud-load-balancing \
  --set-cloudsql-instances "$INSTANCE_CONNECTION_NAME" \
  --env-vars-file "$env_file" \
  --set-secrets "$secret_string"

gcloud run services describe "$SERVICE_NAME" \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --format='value(status.url)'
