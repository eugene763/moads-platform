#!/usr/bin/env bash

set -euo pipefail

PROJECT_ID="${PROJECT_ID:-moads-pro}"
REGION="${REGION:-us-central1}"
INSTANCE_NAME="${INSTANCE_NAME:-moads-platform-pro}"
DB_NAME="${DB_NAME:-moads_platform}"
DB_USER="${DB_USER:-moads_app}"
ROOT_PASSWORD_SECRET="${ROOT_PASSWORD_SECRET:-MOADS_PLATFORM_PRO_POSTGRES_PASSWORD}"
APP_PASSWORD_SECRET="${APP_PASSWORD_SECRET:-MOADS_PLATFORM_PRO_APP_PASSWORD}"

gcloud services enable sqladmin.googleapis.com --project "$PROJECT_ID"

ROOT_PASSWORD="$(gcloud secrets versions access latest --secret "$ROOT_PASSWORD_SECRET" --project "$PROJECT_ID")"
APP_PASSWORD="$(gcloud secrets versions access latest --secret "$APP_PASSWORD_SECRET" --project "$PROJECT_ID")"

if ! gcloud sql instances describe "$INSTANCE_NAME" --project "$PROJECT_ID" >/dev/null 2>&1; then
  gcloud sql instances create "$INSTANCE_NAME" \
    --project "$PROJECT_ID" \
    --database-version=POSTGRES_16 \
    --edition=ENTERPRISE \
    --cpu=1 \
    --memory=3840MB \
    --region="$REGION" \
    --root-password="$ROOT_PASSWORD" \
    --backup-start-time=03:00 \
    --enable-point-in-time-recovery \
    --deletion-protection
fi

if ! gcloud sql databases describe "$DB_NAME" \
  --instance "$INSTANCE_NAME" \
  --project "$PROJECT_ID" >/dev/null 2>&1; then
  gcloud sql databases create "$DB_NAME" \
    --instance="$INSTANCE_NAME" \
    --project "$PROJECT_ID"
fi

if ! gcloud sql users list \
  --instance="$INSTANCE_NAME" \
  --project "$PROJECT_ID" \
  --format='value(name)' | grep -Fxq "$DB_USER"; then
  gcloud sql users create "$DB_USER" \
    --instance="$INSTANCE_NAME" \
    --password="$APP_PASSWORD" \
    --project "$PROJECT_ID"
else
  gcloud sql users set-password "$DB_USER" \
    --instance="$INSTANCE_NAME" \
    --password="$APP_PASSWORD" \
    --project "$PROJECT_ID"
fi

gcloud sql instances patch "$INSTANCE_NAME" \
  --project "$PROJECT_ID" \
  --backup-start-time=03:00 \
  --enable-point-in-time-recovery \
  --deletion-protection \
  --quiet >/dev/null

gcloud sql instances describe "$INSTANCE_NAME" \
  --project "$PROJECT_ID" \
  --format='json(name,region,state,settings.tier,settings.edition,settings.backupConfiguration.enabled,settings.backupConfiguration.startTime,settings.backupConfiguration.pointInTimeRecoveryEnabled,settings.deletionProtectionEnabled,connectionName)'
