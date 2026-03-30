#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env.prod.local}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing env file: $ENV_FILE" >&2
  exit 1
fi

set -a
source "$ENV_FILE"
set +a

if [[ "${DEPLOY_API_BASE_URL+x}" == "x" ]]; then
  runtime_api_base_url="$DEPLOY_API_BASE_URL"
else
  runtime_api_base_url="${API_BASE_URL:-}"
fi

if [[ "${DEPLOY_SESSION_COOKIE_DOMAIN+x}" == "x" ]]; then
  runtime_session_cookie_domain="$DEPLOY_SESSION_COOKIE_DOMAIN"
else
  runtime_session_cookie_domain="${SESSION_COOKIE_DOMAIN:-}"
fi

if [[ "${DEPLOY_TASK_DISPATCH_MODE+x}" == "x" ]]; then
  runtime_task_dispatch_mode="$DEPLOY_TASK_DISPATCH_MODE"
else
  runtime_task_dispatch_mode="${TASK_DISPATCH_MODE:-cloud-tasks}"
fi

if [[ "${DEPLOY_MOTREND_PROVIDER_MODE+x}" == "x" ]]; then
  runtime_provider_mode="$DEPLOY_MOTREND_PROVIDER_MODE"
else
  runtime_provider_mode="${MOTREND_PROVIDER_MODE:-manual}"
fi

PROJECT_ID="${PROJECT_ID:-${FIREBASE_PROJECT_ID:-}}"
REGION="${REGION:-${CLOUD_TASKS_LOCATION:-us-central1}}"
SERVICE_NAME="${SERVICE_NAME:-moads-api}"
INSTANCE_NAME="${INSTANCE_NAME:-moads-platform-prod}"
INSTANCE_CONNECTION_NAME="${INSTANCE_CONNECTION_NAME:-$PROJECT_ID:$REGION:$INSTANCE_NAME}"
RUNTIME_SERVICE_ACCOUNT_EMAIL="${RUNTIME_SERVICE_ACCOUNT_EMAIL:-moads-api-prod-runtime@${PROJECT_ID}.iam.gserviceaccount.com}"
SESSION_COOKIE_SECRET_NAME="${SESSION_COOKIE_SECRET_NAME:-SESSION_COOKIE_SECRET_PROD}"
DATABASE_URL_SECRET_NAME="${DATABASE_URL_SECRET_NAME:-MOADS_API_PROD_DATABASE_URL}"

if [[ -z "${PROJECT_ID}" ]]; then
  echo "FIREBASE_PROJECT_ID or PROJECT_ID is required." >&2
  exit 1
fi

required_secrets=(
  "$SESSION_COOKIE_SECRET_NAME"
  "$DATABASE_URL_SECRET_NAME"
  "KLING_ACCESS_KEY"
  "KLING_SECRET_KEY"
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
  "KLING_ACCESS_KEY=KLING_ACCESS_KEY:latest"
  "KLING_SECRET_KEY=KLING_SECRET_KEY:latest"
)

if [[ "${ATTACH_FIREBASE_SERVICE_ACCOUNT_SECRET:-false}" == "true" ]] && \
  gcloud secrets describe FIREBASE_SERVICE_ACCOUNT --project "$PROJECT_ID" >/dev/null 2>&1; then
  secret_flags+=("FIREBASE_SERVICE_ACCOUNT_JSON=FIREBASE_SERVICE_ACCOUNT:latest")
fi

env_pairs=(
  "MOADS_ENV=prod"
  "NODE_ENV=production"
  "SESSION_COOKIE_NAME=${SESSION_COOKIE_NAME:-moads_session}"
  "SESSION_COOKIE_MAX_AGE_MS=${SESSION_COOKIE_MAX_AGE_MS:-1209600000}"
  "DEFAULT_DEV_PRODUCT_CODE=${DEFAULT_DEV_PRODUCT_CODE:-motrend}"
  "API_ALLOWED_ORIGINS=${API_ALLOWED_ORIGINS:-}"
  "API_BASE_URL=${runtime_api_base_url}"
  "FIREBASE_PROJECT_ID=${FIREBASE_PROJECT_ID:-}"
  "FIREBASE_STORAGE_BUCKET=${FIREBASE_STORAGE_BUCKET:-}"
  "TASK_DISPATCH_MODE=${runtime_task_dispatch_mode}"
  "TASK_DISPATCH_TIMEOUT_MS=${TASK_DISPATCH_TIMEOUT_MS:-5000}"
  "CLOUD_TASKS_PROJECT_ID=${CLOUD_TASKS_PROJECT_ID:-$PROJECT_ID}"
  "CLOUD_TASKS_LOCATION=${CLOUD_TASKS_LOCATION:-$REGION}"
  "CLOUD_TASKS_MOTREND_SUBMIT_QUEUE=${CLOUD_TASKS_MOTREND_SUBMIT_QUEUE:-motrend-submit-prod}"
  "CLOUD_TASKS_MOTREND_POLL_QUEUE=${CLOUD_TASKS_MOTREND_POLL_QUEUE:-motrend-poll-prod}"
  "CLOUD_TASKS_MOTREND_DOWNLOAD_QUEUE=${CLOUD_TASKS_MOTREND_DOWNLOAD_QUEUE:-motrend-download-prod}"
  "CLOUD_TASKS_INVOKER_SERVICE_ACCOUNT_EMAIL=${CLOUD_TASKS_INVOKER_SERVICE_ACCOUNT_EMAIL:-}"
  "MOTREND_PROVIDER_MODE=${runtime_provider_mode}"
  "MOTREND_PROVIDER_POLL_DELAY_MS=${MOTREND_PROVIDER_POLL_DELAY_MS:-2000}"
  "KLING_BASE_URL=${KLING_BASE_URL:-https://api-singapore.klingai.com}"
  "KLING_HTTP_TIMEOUT_MS=${KLING_HTTP_TIMEOUT_MS:-20000}"
)

if [[ -n "${runtime_session_cookie_domain}" ]]; then
  env_pairs+=("SESSION_COOKIE_DOMAIN=${runtime_session_cookie_domain}")
fi

if [[ -n "${INTERNAL_API_KEY:-}" ]]; then
  env_pairs+=("INTERNAL_API_KEY=${INTERNAL_API_KEY}")
fi

if [[ -n "${MOTREND_STUB_OUTPUT_URL:-}" ]]; then
  env_pairs+=("MOTREND_STUB_OUTPUT_URL=${MOTREND_STUB_OUTPUT_URL}")
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
  --max-instances 5 \
  --service-account "$RUNTIME_SERVICE_ACCOUNT_EMAIL" \
  --ingress internal-and-cloud-load-balancing \
  --set-cloudsql-instances "$INSTANCE_CONNECTION_NAME" \
  --env-vars-file "$env_file" \
  --set-secrets "$secret_string"

gcloud run services describe "$SERVICE_NAME" \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --format='value(status.url)'
