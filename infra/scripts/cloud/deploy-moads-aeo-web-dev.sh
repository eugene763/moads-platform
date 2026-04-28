#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env.dev-cloud.local}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing env file: $ENV_FILE" >&2
  exit 1
fi

set -a
source "$ENV_FILE"
set +a

PROJECT_ID="${PROJECT_ID:-${FIREBASE_PROJECT_ID:-}}"
REGION="${REGION:-us-central1}"
SERVICE_NAME="${SERVICE_NAME:-moads-aeo-web-dev}"
NEXT_PUBLIC_API_BASE_URL="${NEXT_PUBLIC_API_BASE_URL:-https://api-dev.moads.agency}"
NEXT_PUBLIC_FIREBASE_PROJECT_ID="${NEXT_PUBLIC_FIREBASE_PROJECT_ID:-${FIREBASE_PROJECT_ID:-$PROJECT_ID}}"
NEXT_PUBLIC_GA4_MEASUREMENT_ID="${NEXT_PUBLIC_GA4_MEASUREMENT_ID:-${NEXT_PUBLIC_GA_MEASUREMENT_ID:-}}"

if [[ -z "$PROJECT_ID" ]]; then
  echo "PROJECT_ID or FIREBASE_PROJECT_ID is required." >&2
  exit 1
fi

if [[ -z "${NEXT_PUBLIC_FIREBASE_API_KEY:-}" || -z "${NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN:-}" || -z "${NEXT_PUBLIC_FIREBASE_APP_ID:-}" ]]; then
  echo "NEXT_PUBLIC_FIREBASE_API_KEY, NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN, and NEXT_PUBLIC_FIREBASE_APP_ID are required." >&2
  exit 1
fi

env_pairs=(
  "NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL"
  "NEXT_PUBLIC_FIREBASE_API_KEY=$NEXT_PUBLIC_FIREBASE_API_KEY"
  "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=$NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN"
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID=$NEXT_PUBLIC_FIREBASE_PROJECT_ID"
  "NEXT_PUBLIC_FIREBASE_APP_ID=$NEXT_PUBLIC_FIREBASE_APP_ID"
)

if [[ -n "$NEXT_PUBLIC_GA4_MEASUREMENT_ID" ]]; then
  env_pairs+=("NEXT_PUBLIC_GA4_MEASUREMENT_ID=$NEXT_PUBLIC_GA4_MEASUREMENT_ID")
fi

env_string="$(IFS=,; printf '%s' "${env_pairs[*]}")"

gcloud run deploy "$SERVICE_NAME" \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --source "$ROOT_DIR/apps/aeo-web" \
  --set-build-env-vars "$env_string" \
  --allow-unauthenticated \
  --no-invoker-iam-check \
  --ingress all \
  --cpu 1 \
  --memory 1Gi \
  --concurrency 80 \
  --min-instances 0 \
  --max-instances 3 \
  --set-env-vars "$env_string"

gcloud run services describe "$SERVICE_NAME" \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --format='value(status.url)'
