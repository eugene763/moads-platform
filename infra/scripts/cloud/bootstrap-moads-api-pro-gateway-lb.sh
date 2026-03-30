#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env.pro.local}"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  source "$ENV_FILE"
  set +a
fi

GATEWAY_PROJECT_ID="${GATEWAY_PROJECT_ID:-${PROJECT_ID:-moads-gateway}}"
REGION="${REGION:-us-central1}"
API_BASE_URL="${API_BASE_URL:-https://api.moads.agency}"
API_HOST="${API_HOST:-$(python3 - <<'PY'
from urllib.parse import urlparse
import os
print(urlparse(os.environ.get("API_BASE_URL", "https://api.moads.agency")).hostname or "api.moads.agency")
PY
)}"

CONSUMER_SERVICE_NAME="${CONSUMER_SERVICE_NAME:-moads-api}"
PRO_SERVICE_NAME="${PRO_SERVICE_NAME:-moads-api-pro}"

CONSUMER_NEG_NAME="${CONSUMER_NEG_NAME:-moads-api-consumer-neg}"
PRO_NEG_NAME="${PRO_NEG_NAME:-moads-api-pro-neg}"
CONSUMER_BACKEND_NAME="${CONSUMER_BACKEND_NAME:-moads-api-consumer-backend}"
PRO_BACKEND_NAME="${PRO_BACKEND_NAME:-moads-api-pro-backend}"

URL_MAP_NAME="${URL_MAP_NAME:-moads-api-gateway-url-map}"
PATH_MATCHER_NAME="${PATH_MATCHER_NAME:-moads-api-gateway-paths}"
HTTPS_PROXY_NAME="${HTTPS_PROXY_NAME:-moads-api-gateway-https-proxy}"
CERT_NAME="${CERT_NAME:-moads-api-gateway-cert}"
FORWARDING_RULE_NAME_V4="${FORWARDING_RULE_NAME_V4:-moads-api-gateway-https-v4}"
FORWARDING_RULE_NAME_V6="${FORWARDING_RULE_NAME_V6:-moads-api-gateway-https-v6}"
ADDRESS_NAME_V4="${ADDRESS_NAME_V4:-moads-api-gateway-ipv4}"
ADDRESS_NAME_V6="${ADDRESS_NAME_V6:-moads-api-gateway-ipv6}"

gcloud services enable compute.googleapis.com --project "$GATEWAY_PROJECT_ID"

if ! gcloud compute network-endpoint-groups describe "$CONSUMER_NEG_NAME" \
  --project "$GATEWAY_PROJECT_ID" \
  --region "$REGION" >/dev/null 2>&1; then
  gcloud compute network-endpoint-groups create "$CONSUMER_NEG_NAME" \
    --project "$GATEWAY_PROJECT_ID" \
    --region "$REGION" \
    --network-endpoint-type=serverless \
    --cloud-run-service="$CONSUMER_SERVICE_NAME"
fi

if ! gcloud compute network-endpoint-groups describe "$PRO_NEG_NAME" \
  --project "$GATEWAY_PROJECT_ID" \
  --region "$REGION" >/dev/null 2>&1; then
  gcloud compute network-endpoint-groups create "$PRO_NEG_NAME" \
    --project "$GATEWAY_PROJECT_ID" \
    --region "$REGION" \
    --network-endpoint-type=serverless \
    --cloud-run-service="$PRO_SERVICE_NAME"
fi

if ! gcloud compute backend-services describe "$CONSUMER_BACKEND_NAME" \
  --project "$GATEWAY_PROJECT_ID" \
  --global >/dev/null 2>&1; then
  gcloud compute backend-services create "$CONSUMER_BACKEND_NAME" \
    --project "$GATEWAY_PROJECT_ID" \
    --global \
    --load-balancing-scheme=EXTERNAL_MANAGED
fi

if ! gcloud compute backend-services describe "$PRO_BACKEND_NAME" \
  --project "$GATEWAY_PROJECT_ID" \
  --global >/dev/null 2>&1; then
  gcloud compute backend-services create "$PRO_BACKEND_NAME" \
    --project "$GATEWAY_PROJECT_ID" \
    --global \
    --load-balancing-scheme=EXTERNAL_MANAGED
fi

if ! gcloud compute backend-services describe "$CONSUMER_BACKEND_NAME" \
  --project "$GATEWAY_PROJECT_ID" \
  --global \
  --format='value(backends[].group)' | grep -q "/networkEndpointGroups/$CONSUMER_NEG_NAME$"; then
  gcloud compute backend-services add-backend "$CONSUMER_BACKEND_NAME" \
    --project "$GATEWAY_PROJECT_ID" \
    --global \
    --network-endpoint-group="$CONSUMER_NEG_NAME" \
    --network-endpoint-group-region="$REGION"
fi

if ! gcloud compute backend-services describe "$PRO_BACKEND_NAME" \
  --project "$GATEWAY_PROJECT_ID" \
  --global \
  --format='value(backends[].group)' | grep -q "/networkEndpointGroups/$PRO_NEG_NAME$"; then
  gcloud compute backend-services add-backend "$PRO_BACKEND_NAME" \
    --project "$GATEWAY_PROJECT_ID" \
    --global \
    --network-endpoint-group="$PRO_NEG_NAME" \
    --network-endpoint-group-region="$REGION"
fi

if ! gcloud compute url-maps describe "$URL_MAP_NAME" \
  --project "$GATEWAY_PROJECT_ID" >/dev/null 2>&1; then
  gcloud compute url-maps create "$URL_MAP_NAME" \
    --project "$GATEWAY_PROJECT_ID" \
    --default-service="$CONSUMER_BACKEND_NAME"
else
  gcloud compute url-maps set-default-service "$URL_MAP_NAME" \
    --project "$GATEWAY_PROJECT_ID" \
    --default-service="$CONSUMER_BACKEND_NAME"
fi

if gcloud compute url-maps describe "$URL_MAP_NAME" \
  --project "$GATEWAY_PROJECT_ID" \
  --format='value(pathMatchers[].name)' | grep -Fxq "$PATH_MATCHER_NAME"; then
  gcloud compute url-maps remove-path-matcher "$URL_MAP_NAME" \
    --project "$GATEWAY_PROJECT_ID" \
    --path-matcher-name="$PATH_MATCHER_NAME" \
    --quiet || true
fi

gcloud compute url-maps add-path-matcher "$URL_MAP_NAME" \
  --project "$GATEWAY_PROJECT_ID" \
  --path-matcher-name="$PATH_MATCHER_NAME" \
  --default-service="$CONSUMER_BACKEND_NAME" \
  --new-hosts="$API_HOST" \
  --path-rules="/v1/aeo/*=$PRO_BACKEND_NAME,/v1/lab/*=$PRO_BACKEND_NAME,/v1/auth/*=$PRO_BACKEND_NAME,/v1/wallet/*=$PRO_BACKEND_NAME,/v1/me/*=$PRO_BACKEND_NAME"

if ! gcloud compute ssl-certificates describe "$CERT_NAME" \
  --project "$GATEWAY_PROJECT_ID" \
  --global >/dev/null 2>&1; then
  gcloud compute ssl-certificates create "$CERT_NAME" \
    --project "$GATEWAY_PROJECT_ID" \
    --global \
    --domains="$API_HOST"
fi

if ! gcloud compute target-https-proxies describe "$HTTPS_PROXY_NAME" \
  --project "$GATEWAY_PROJECT_ID" >/dev/null 2>&1; then
  gcloud compute target-https-proxies create "$HTTPS_PROXY_NAME" \
    --project "$GATEWAY_PROJECT_ID" \
    --url-map="$URL_MAP_NAME" \
    --ssl-certificates="$CERT_NAME"
else
  gcloud compute target-https-proxies update "$HTTPS_PROXY_NAME" \
    --project "$GATEWAY_PROJECT_ID" \
    --url-map="$URL_MAP_NAME" \
    --ssl-certificates="$CERT_NAME"
fi

if ! gcloud compute addresses describe "$ADDRESS_NAME_V4" \
  --project "$GATEWAY_PROJECT_ID" \
  --global >/dev/null 2>&1; then
  gcloud compute addresses create "$ADDRESS_NAME_V4" \
    --project "$GATEWAY_PROJECT_ID" \
    --global \
    --ip-version=IPV4
fi

if ! gcloud compute addresses describe "$ADDRESS_NAME_V6" \
  --project "$GATEWAY_PROJECT_ID" \
  --global >/dev/null 2>&1; then
  gcloud compute addresses create "$ADDRESS_NAME_V6" \
    --project "$GATEWAY_PROJECT_ID" \
    --global \
    --ip-version=IPV6
fi

if ! gcloud compute forwarding-rules describe "$FORWARDING_RULE_NAME_V4" \
  --project "$GATEWAY_PROJECT_ID" \
  --global >/dev/null 2>&1; then
  gcloud compute forwarding-rules create "$FORWARDING_RULE_NAME_V4" \
    --project "$GATEWAY_PROJECT_ID" \
    --global \
    --load-balancing-scheme=EXTERNAL_MANAGED \
    --network-tier=PREMIUM \
    --address="$ADDRESS_NAME_V4" \
    --target-https-proxy="$HTTPS_PROXY_NAME" \
    --ports=443
fi

if ! gcloud compute forwarding-rules describe "$FORWARDING_RULE_NAME_V6" \
  --project "$GATEWAY_PROJECT_ID" \
  --global >/dev/null 2>&1; then
  gcloud compute forwarding-rules create "$FORWARDING_RULE_NAME_V6" \
    --project "$GATEWAY_PROJECT_ID" \
    --global \
    --load-balancing-scheme=EXTERNAL_MANAGED \
    --network-tier=PREMIUM \
    --address="$ADDRESS_NAME_V6" \
    --target-https-proxy="$HTTPS_PROXY_NAME" \
    --ports=443
fi

address_v4="$(gcloud compute addresses describe "$ADDRESS_NAME_V4" --project "$GATEWAY_PROJECT_ID" --global --format='value(address)')"
address_v6="$(gcloud compute addresses describe "$ADDRESS_NAME_V6" --project "$GATEWAY_PROJECT_ID" --global --format='value(address)')"
cert_status="$(gcloud compute ssl-certificates describe "$CERT_NAME" --project "$GATEWAY_PROJECT_ID" --global --format='value(managed.status)')"

cat <<OUT
api_host=$API_HOST
ipv4=$address_v4
ipv6=$address_v6
certificate_status=$cert_status
pro_backend=$PRO_BACKEND_NAME
consumer_backend=$CONSUMER_BACKEND_NAME
OUT
