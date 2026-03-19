#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env.prod.local}"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  source "$ENV_FILE"
  set +a
fi

PROJECT_ID="${PROJECT_ID:-${FIREBASE_PROJECT_ID:-gen-lang-client-0651837818}}"
REGION="${REGION:-${CLOUD_TASKS_LOCATION:-us-central1}}"
SERVICE_NAME="${SERVICE_NAME:-moads-api}"
API_BASE_URL="${API_BASE_URL:-https://api.moads.agency}"
API_HOST="${API_HOST:-$(python3 - <<'PY'
from urllib.parse import urlparse
import os
print(urlparse(os.environ.get("API_BASE_URL", "https://api.moads.agency")).hostname or "api.moads.agency")
PY
)}"
NEG_NAME="${NEG_NAME:-moads-api-prod-neg}"
BACKEND_SERVICE_NAME="${BACKEND_SERVICE_NAME:-moads-api-prod-backend}"
URL_MAP_NAME="${URL_MAP_NAME:-moads-api-prod-url-map}"
HTTPS_PROXY_NAME="${HTTPS_PROXY_NAME:-moads-api-prod-https-proxy}"
CERT_NAME="${CERT_NAME:-moads-api-prod-cert}"
FORWARDING_RULE_NAME_V4="${FORWARDING_RULE_NAME_V4:-moads-api-prod-https-v4}"
FORWARDING_RULE_NAME_V6="${FORWARDING_RULE_NAME_V6:-moads-api-prod-https-v6}"
ADDRESS_NAME_V4="${ADDRESS_NAME_V4:-moads-api-prod-ipv4}"
ADDRESS_NAME_V6="${ADDRESS_NAME_V6:-moads-api-prod-ipv6}"

gcloud services enable compute.googleapis.com --project "$PROJECT_ID"

if ! gcloud compute network-endpoint-groups describe "$NEG_NAME" \
  --project "$PROJECT_ID" \
  --region "$REGION" >/dev/null 2>&1; then
  gcloud compute network-endpoint-groups create "$NEG_NAME" \
    --project "$PROJECT_ID" \
    --region "$REGION" \
    --network-endpoint-type=serverless \
    --cloud-run-service="$SERVICE_NAME"
fi

if ! gcloud compute backend-services describe "$BACKEND_SERVICE_NAME" \
  --project "$PROJECT_ID" \
  --global >/dev/null 2>&1; then
  gcloud compute backend-services create "$BACKEND_SERVICE_NAME" \
    --project "$PROJECT_ID" \
    --global \
    --load-balancing-scheme=EXTERNAL_MANAGED
fi

if ! gcloud compute backend-services describe "$BACKEND_SERVICE_NAME" \
  --project "$PROJECT_ID" \
  --global \
  --format='value(backends[].group)' | grep -q "/networkEndpointGroups/$NEG_NAME$"; then
  gcloud compute backend-services add-backend "$BACKEND_SERVICE_NAME" \
    --project "$PROJECT_ID" \
    --global \
    --network-endpoint-group="$NEG_NAME" \
    --network-endpoint-group-region="$REGION"
fi

if ! gcloud compute url-maps describe "$URL_MAP_NAME" \
  --project "$PROJECT_ID" >/dev/null 2>&1; then
  gcloud compute url-maps create "$URL_MAP_NAME" \
    --project "$PROJECT_ID" \
    --default-service="$BACKEND_SERVICE_NAME"
else
  gcloud compute url-maps set-default-service "$URL_MAP_NAME" \
    --project "$PROJECT_ID" \
    --default-service="$BACKEND_SERVICE_NAME"
fi

if ! gcloud compute ssl-certificates describe "$CERT_NAME" \
  --project "$PROJECT_ID" \
  --global >/dev/null 2>&1; then
  gcloud compute ssl-certificates create "$CERT_NAME" \
    --project "$PROJECT_ID" \
    --global \
    --domains="$API_HOST"
fi

if ! gcloud compute target-https-proxies describe "$HTTPS_PROXY_NAME" \
  --project "$PROJECT_ID" >/dev/null 2>&1; then
  gcloud compute target-https-proxies create "$HTTPS_PROXY_NAME" \
    --project "$PROJECT_ID" \
    --url-map="$URL_MAP_NAME" \
    --ssl-certificates="$CERT_NAME"
else
  gcloud compute target-https-proxies update "$HTTPS_PROXY_NAME" \
    --project "$PROJECT_ID" \
    --url-map="$URL_MAP_NAME" \
    --ssl-certificates="$CERT_NAME"
fi

if ! gcloud compute addresses describe "$ADDRESS_NAME_V4" \
  --project "$PROJECT_ID" \
  --global >/dev/null 2>&1; then
  gcloud compute addresses create "$ADDRESS_NAME_V4" \
    --project "$PROJECT_ID" \
    --global \
    --ip-version=IPV4
fi

if ! gcloud compute addresses describe "$ADDRESS_NAME_V6" \
  --project "$PROJECT_ID" \
  --global >/dev/null 2>&1; then
  gcloud compute addresses create "$ADDRESS_NAME_V6" \
    --project "$PROJECT_ID" \
    --global \
    --ip-version=IPV6
fi

address_v4="$(gcloud compute addresses describe "$ADDRESS_NAME_V4" --project "$PROJECT_ID" --global --format='value(address)')"
address_v6="$(gcloud compute addresses describe "$ADDRESS_NAME_V6" --project "$PROJECT_ID" --global --format='value(address)')"

if ! gcloud compute forwarding-rules describe "$FORWARDING_RULE_NAME_V4" \
  --project "$PROJECT_ID" \
  --global >/dev/null 2>&1; then
  gcloud compute forwarding-rules create "$FORWARDING_RULE_NAME_V4" \
    --project "$PROJECT_ID" \
    --global \
    --load-balancing-scheme=EXTERNAL_MANAGED \
    --network-tier=PREMIUM \
    --address="$ADDRESS_NAME_V4" \
    --target-https-proxy="$HTTPS_PROXY_NAME" \
    --ports=443
fi

if ! gcloud compute forwarding-rules describe "$FORWARDING_RULE_NAME_V6" \
  --project "$PROJECT_ID" \
  --global >/dev/null 2>&1; then
  gcloud compute forwarding-rules create "$FORWARDING_RULE_NAME_V6" \
    --project "$PROJECT_ID" \
    --global \
    --load-balancing-scheme=EXTERNAL_MANAGED \
    --network-tier=PREMIUM \
    --address="$ADDRESS_NAME_V6" \
    --target-https-proxy="$HTTPS_PROXY_NAME" \
    --ports=443
fi

cert_status="$(gcloud compute ssl-certificates describe "$CERT_NAME" --project "$PROJECT_ID" --global --format='value(managed.status)')"

cat <<EOF
api_host=$API_HOST
ipv4=$address_v4
ipv6=$address_v6
certificate_status=$cert_status
dns_a_record=$address_v4
dns_aaaa_record=$address_v6
EOF
