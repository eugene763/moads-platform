#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT_DIR"

mkdir -p ./infra/firebase/.emulator-data

pnpm exec firebase emulators:start \
  --project demo-moads-local \
  --config ./firebase.json \
  --only auth,hosting,storage \
  --import=./infra/firebase/.emulator-data \
  --export-on-exit=./infra/firebase/.emulator-data
