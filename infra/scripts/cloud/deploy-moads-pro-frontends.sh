#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env.pro.local}"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  source "$ENV_FILE"
  set +a
fi

PROJECT_ID="${PROJECT_ID:-${FIREBASE_PROJECT_ID:-}}"
REGION="${REGION:-us-central1}"

AEO_SERVICE_NAME="${AEO_SERVICE_NAME:-moads-aeo-web}"
LAB_SERVICE_NAME="${LAB_SERVICE_NAME:-moads-lab-web}"

AEO_SITE_ID="${AEO_SITE_ID:-moads-aeo}"
LAB_SITE_ID="${LAB_SITE_ID:-moads-lab}"
DEFAULT_SITE_ID="${DEFAULT_SITE_ID:-${PROJECT_ID}}"

AEO_DOMAIN="${AEO_DOMAIN:-aeo.moads.agency}"
LAB_DOMAIN="${LAB_DOMAIN:-lab.moads.agency}"

NEXT_PUBLIC_API_BASE_URL="${NEXT_PUBLIC_API_BASE_URL:-https://api.moads.agency}"
NEXT_PUBLIC_FIREBASE_API_KEY="${NEXT_PUBLIC_FIREBASE_API_KEY:-}"
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN="${NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN:-}"
NEXT_PUBLIC_FIREBASE_PROJECT_ID="${NEXT_PUBLIC_FIREBASE_PROJECT_ID:-${PROJECT_ID}}"
NEXT_PUBLIC_FIREBASE_APP_ID="${NEXT_PUBLIC_FIREBASE_APP_ID:-}"
NEXT_PUBLIC_GA4_MEASUREMENT_ID="${NEXT_PUBLIC_GA4_MEASUREMENT_ID:-${NEXT_PUBLIC_GA_MEASUREMENT_ID:-}}"

if [[ -z "$PROJECT_ID" ]]; then
  echo "PROJECT_ID (or FIREBASE_PROJECT_ID) is required." >&2
  exit 1
fi

if [[ -z "$NEXT_PUBLIC_FIREBASE_API_KEY" || -z "$NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN" || -z "$NEXT_PUBLIC_FIREBASE_APP_ID" ]]; then
  echo "NEXT_PUBLIC_FIREBASE_API_KEY, NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN, and NEXT_PUBLIC_FIREBASE_APP_ID are required." >&2
  exit 1
fi

echo "Enabling required APIs in project: $PROJECT_ID"
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  firebase.googleapis.com \
  firebasehosting.googleapis.com \
  --project "$PROJECT_ID"

build_frontend_env() {
  local env_pairs=(
    "NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL"
    "NEXT_PUBLIC_FIREBASE_API_KEY=$NEXT_PUBLIC_FIREBASE_API_KEY"
    "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=$NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN"
    "NEXT_PUBLIC_FIREBASE_PROJECT_ID=$NEXT_PUBLIC_FIREBASE_PROJECT_ID"
    "NEXT_PUBLIC_FIREBASE_APP_ID=$NEXT_PUBLIC_FIREBASE_APP_ID"
  )

  if [[ -n "$NEXT_PUBLIC_GA4_MEASUREMENT_ID" ]]; then
    env_pairs+=("NEXT_PUBLIC_GA4_MEASUREMENT_ID=$NEXT_PUBLIC_GA4_MEASUREMENT_ID")
  fi

  local env_string
  env_string="$(IFS=,; printf '%s' "${env_pairs[*]}")"
  echo "$env_string"
}

deploy_frontend_service() {
  local service_name="$1"
  local app_dir="$2"
  local env_string="$3"

  echo "Deploying Cloud Run service: $service_name from $app_dir"
  gcloud run deploy "$service_name" \
    --project "$PROJECT_ID" \
    --region "$REGION" \
    --source "$app_dir" \
    --allow-unauthenticated \
    --no-invoker-iam-check \
    --ingress all \
    --cpu 1 \
    --memory 1Gi \
    --concurrency 80 \
    --min-instances 0 \
    --max-instances 6 \
    --set-env-vars "$env_string"
}

ensure_hosting_site() {
  local site_id="$1"
  if pnpm --dir "$ROOT_DIR" exec firebase hosting:sites:get "$site_id" --project "$PROJECT_ID" >/dev/null 2>&1; then
    echo "Hosting site exists: $site_id"
    return
  fi

  echo "Creating Hosting site: $site_id"
  pnpm --dir "$ROOT_DIR" exec firebase hosting:sites:create "$site_id" --project "$PROJECT_ID"
}

domain_exists_on_site() {
  local site_id="$1"
  local domain="$2"
  local token="$3"
  local response_file="$4"

  local code
  code="$(curl -sS -o "$response_file" -w "%{http_code}" \
    -H "Authorization: Bearer $token" \
    -H "x-goog-user-project: $PROJECT_ID" \
    "https://firebasehosting.googleapis.com/v1beta1/projects/$PROJECT_ID/sites/$site_id/customDomains/$domain")"

  [[ "$code" == "200" ]]
}

delete_domain_from_site_if_present() {
  local site_id="$1"
  local domain="$2"
  local token="$3"

  local code
  code="$(curl -sS -o /dev/null -w "%{http_code}" -X DELETE \
    -H "Authorization: Bearer $token" \
    -H "x-goog-user-project: $PROJECT_ID" \
    "https://firebasehosting.googleapis.com/v1beta1/projects/$PROJECT_ID/sites/$site_id/customDomains/$domain")"

  if [[ "$code" == "200" || "$code" == "204" ]]; then
    echo "Removed domain $domain from site $site_id"
  elif [[ "$code" == "404" ]]; then
    echo "Domain $domain is not mapped on site $site_id"
  else
    echo "Failed to remove domain $domain from site $site_id (HTTP $code)" >&2
    exit 1
  fi
}

attach_domain_to_site() {
  local domain="$1"
  local target_site="$2"
  local token="$3"

  local tmp_file
  tmp_file="$(mktemp)"

  if domain_exists_on_site "$target_site" "$domain" "$token" "$tmp_file"; then
    echo "Domain $domain already mapped to site $target_site"
    rm -f "$tmp_file"
    return
  fi

  delete_domain_from_site_if_present "$DEFAULT_SITE_ID" "$domain" "$token"

  local code
  code="$(curl -sS -o "$tmp_file" -w "%{http_code}" -X POST \
    -H "Authorization: Bearer $token" \
    -H "x-goog-user-project: $PROJECT_ID" \
    "https://firebasehosting.googleapis.com/v1beta1/projects/$PROJECT_ID/sites/$target_site/customDomains?customDomainId=$domain")"

  if [[ "$code" != "200" ]]; then
    echo "Failed to map domain $domain to site $target_site (HTTP $code)." >&2
    cat "$tmp_file" >&2
    rm -f "$tmp_file"
    exit 1
  fi

  echo "Mapped domain $domain -> $target_site"
  rm -f "$tmp_file"
}

print_domain_status() {
  local domain="$1"
  local site_id="$2"
  local token="$3"
  local tmp_file
  tmp_file="$(mktemp)"

  local code
  code="$(curl -sS -o "$tmp_file" -w "%{http_code}" \
    -H "Authorization: Bearer $token" \
    -H "x-goog-user-project: $PROJECT_ID" \
    "https://firebasehosting.googleapis.com/v1beta1/projects/$PROJECT_ID/sites/$site_id/customDomains/$domain")"

  if [[ "$code" != "200" ]]; then
    echo "custom_domain_status domain=$domain site=$site_id http=$code"
    cat "$tmp_file"
    rm -f "$tmp_file"
    return
  fi

  local ownership_state
  ownership_state="$(grep -o '"ownershipState":[[:space:]]*"[^"]*"' "$tmp_file" | head -n1 | sed 's/.*"ownershipState":[[:space:]]*"\([^"]*\)"/\1/')"
  local host_state
  host_state="$(grep -o '"hostState":[[:space:]]*"[^"]*"' "$tmp_file" | head -n1 | sed 's/.*"hostState":[[:space:]]*"\([^"]*\)"/\1/')"
  local cert_state
  cert_state="$(grep -o '"state":[[:space:]]*"CERT_[^"]*"' "$tmp_file" | head -n1 | sed 's/.*"state":[[:space:]]*"\([^"]*\)"/\1/')"
  local desired_cname
  desired_cname="$(grep -o '"rdata":[[:space:]]*"[^"]*"' "$tmp_file" | tail -n1 | sed 's/.*"rdata":[[:space:]]*"\([^"]*\)"/\1/')"

  echo "custom_domain_status domain=$domain site=$site_id ownership=$ownership_state host=$host_state cert=$cert_state desired_cname=$desired_cname"
  rm -f "$tmp_file"
}

ENV_STRING="$(build_frontend_env)"

deploy_frontend_service "$AEO_SERVICE_NAME" "$ROOT_DIR/apps/aeo-web" "$ENV_STRING"
deploy_frontend_service "$LAB_SERVICE_NAME" "$ROOT_DIR/apps/lab-web" "$ENV_STRING"

ensure_hosting_site "$AEO_SITE_ID"
ensure_hosting_site "$LAB_SITE_ID"

firebase_config="$(mktemp "$ROOT_DIR/.firebase.pro-frontends.XXXXXX.json")"
cleanup() {
  rm -f "$firebase_config"
}
trap cleanup EXIT

cat >"$firebase_config" <<EOF
{
  "hosting": [
    {
      "site": "$AEO_SITE_ID",
      "public": "infra/firebase/hosting/proxy",
      "ignore": [
        "firebase.json",
        "**/.*",
        "**/node_modules/**"
      ],
      "rewrites": [
        {
          "source": "**",
          "run": {
            "serviceId": "$AEO_SERVICE_NAME",
            "region": "$REGION"
          }
        }
      ]
    },
    {
      "site": "$LAB_SITE_ID",
      "public": "infra/firebase/hosting/proxy",
      "ignore": [
        "firebase.json",
        "**/.*",
        "**/node_modules/**"
      ],
      "rewrites": [
        {
          "source": "**",
          "run": {
            "serviceId": "$LAB_SERVICE_NAME",
            "region": "$REGION"
          }
        }
      ]
    }
  ]
}
EOF

pnpm --dir "$ROOT_DIR" exec firebase deploy \
  --project "$PROJECT_ID" \
  --config "$firebase_config" \
  --only hosting

token="$(gcloud auth print-access-token)"
attach_domain_to_site "$AEO_DOMAIN" "$AEO_SITE_ID" "$token"
attach_domain_to_site "$LAB_DOMAIN" "$LAB_SITE_ID" "$token"
print_domain_status "$AEO_DOMAIN" "$AEO_SITE_ID" "$token"
print_domain_status "$LAB_DOMAIN" "$LAB_SITE_ID" "$token"

echo "Verifying endpoints:"
curl -sS -L -o /dev/null -w "aeo_status=%{http_code}\n" "https://$AEO_DOMAIN/"
curl -sS -L -o /dev/null -w "lab_status=%{http_code}\n" "https://$LAB_DOMAIN/"
curl -sS -L -o /dev/null -w "aeo_site_status=%{http_code}\n" "https://$AEO_SITE_ID.web.app/"
curl -sS -L -o /dev/null -w "lab_site_status=%{http_code}\n" "https://$LAB_SITE_ID.web.app/"
