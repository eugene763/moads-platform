#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
PROJECT_ID="${PROJECT_ID:-gen-lang-client-0651837818}"
REGION="${REGION:-us-central1}"
INSTANCE_NAME="${INSTANCE_NAME:-moads-platform-dev}"
INSTANCE_CONNECTION_NAME="${INSTANCE_CONNECTION_NAME:-$PROJECT_ID:$REGION:$INSTANCE_NAME}"
PROXY_BIN="${PROXY_BIN:-/tmp/cloud-sql-proxy}"
PROXY_PORT="${PROXY_PORT:-55432}"
PROXY_AUTH_FLAG="${PROXY_AUTH_FLAG:---gcloud-auth}"
PROXY_LOG_FILE="${PROXY_LOG_FILE:-/tmp/moads-dev-cloud-sql-proxy.log}"

if [[ $# -eq 0 ]]; then
  echo "Usage: with-dev-cloud-sql-proxy.sh <command> [args...]" >&2
  exit 1
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL must be set before starting the dev-cloud SQL proxy helper." >&2
  exit 1
fi

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

DATABASE_URL="$(node - <<'NODE' "$DATABASE_URL" "$PROXY_PORT"
const [rawUrl, proxyPort] = process.argv.slice(2);
const parsed = new URL(rawUrl);
const socketHost = parsed.searchParams.get("host");

if (socketHost && socketHost.startsWith("/cloudsql/")) {
  parsed.hostname = "127.0.0.1";
  parsed.port = proxyPort;
  parsed.searchParams.delete("host");
}

process.stdout.write(parsed.toString());
NODE
)"
export DATABASE_URL

"$PROXY_BIN" "$INSTANCE_CONNECTION_NAME" "$PROXY_AUTH_FLAG" --port "$PROXY_PORT" >"$PROXY_LOG_FILE" 2>&1 &
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
  echo "Cloud SQL Proxy failed to start. Check $PROXY_LOG_FILE" >&2
  exit 1
fi

cd "$ROOT_DIR"
"$@"
