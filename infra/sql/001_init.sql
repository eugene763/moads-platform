-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "access";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "aeo";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "analytics";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "audit";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "billing";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "catalog";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "comms";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "core";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "economics";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "identity";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "motrend";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "ugc";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "wallet";

-- CreateEnum
CREATE TYPE "core"."AccountType" AS ENUM ('PERSONAL');

-- CreateEnum
CREATE TYPE "access"."MembershipType" AS ENUM ('STANDARD', 'BUNDLE', 'INTERNAL');

-- CreateEnum
CREATE TYPE "access"."MembershipStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'REVOKED');

-- CreateEnum
CREATE TYPE "wallet"."WalletScope" AS ENUM ('GLOBAL');

-- CreateEnum
CREATE TYPE "wallet"."LedgerEntryType" AS ENUM ('GRANT', 'PURCHASE', 'SPEND', 'REFUND', 'EXPIRE', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "billing"."BillingOrderStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'CANCELED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "billing"."BillingSubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'PAUSED');

-- CreateEnum
CREATE TYPE "motrend"."MotrendSelectionKind" AS ENUM ('TEMPLATE', 'REFERENCE');

-- CreateEnum
CREATE TYPE "motrend"."MotrendJobStatus" AS ENUM ('AWAITING_UPLOAD', 'QUEUED', 'PROCESSING', 'DONE', 'FAILED');

-- CreateEnum
CREATE TYPE "motrend"."MotrendDownloadArtifactType" AS ENUM ('INLINE', 'DOWNLOAD');

-- CreateEnum
CREATE TYPE "motrend"."MotrendTaskType" AS ENUM ('SUBMIT', 'POLL');

-- CreateEnum
CREATE TYPE "motrend"."MotrendTaskStatus" AS ENUM ('QUEUED', 'PROCESSING', 'DONE', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "identity"."users" (
    "id" TEXT NOT NULL,
    "firebase_uid" TEXT NOT NULL,
    "primary_email" TEXT,
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "display_name" TEXT,
    "photo_url" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "last_login_at" TIMESTAMPTZ(6),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identity"."login_identities" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_subject" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "login_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."accounts" (
    "id" TEXT NOT NULL,
    "owner_user_id" TEXT NOT NULL,
    "name" TEXT,
    "account_type" "core"."AccountType" NOT NULL DEFAULT 'PERSONAL',
    "realm_default" TEXT NOT NULL DEFAULT 'consumer',
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."account_members" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'owner',
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "account_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."support_profiles" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "support_code" TEXT NOT NULL,
    "is_admin" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "support_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalog"."realms" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "realms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalog"."products" (
    "id" TEXT NOT NULL,
    "realm_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "entry_domain" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "is_discoverable" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalog"."features" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "metering_type" TEXT NOT NULL DEFAULT 'none',
    "visibility_type" TEXT NOT NULL DEFAULT 'public',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "features_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalog"."cross_sell_rules" (
    "id" TEXT NOT NULL,
    "source_product_id" TEXT NOT NULL,
    "target_product_id" TEXT NOT NULL,
    "placement_code" TEXT NOT NULL,
    "eligibility_rule_json" JSONB,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "cross_sell_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "access"."product_memberships" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "membership_type" "access"."MembershipType" NOT NULL DEFAULT 'STANDARD',
    "status" "access"."MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "origin" TEXT NOT NULL DEFAULT 'self_signup',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "product_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "access"."entitlements" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "feature_code" TEXT NOT NULL,
    "grant_type" TEXT NOT NULL,
    "limit_value" INTEGER,
    "usage_period" TEXT,
    "starts_at" TIMESTAMPTZ(6),
    "ends_at" TIMESTAMPTZ(6),
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "entitlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet"."wallets" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "wallet_scope" "wallet"."WalletScope" NOT NULL DEFAULT 'GLOBAL',
    "scope_ref" TEXT NOT NULL DEFAULT '',
    "currency_code" TEXT NOT NULL DEFAULT 'CREDITS',
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet"."ledger_entries" (
    "id" TEXT NOT NULL,
    "wallet_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "product_id" TEXT,
    "entry_type" "wallet"."LedgerEntryType" NOT NULL,
    "amount_delta" INTEGER NOT NULL,
    "reason_code" TEXT NOT NULL,
    "ref_type" TEXT NOT NULL,
    "ref_id" TEXT,
    "operation_key" TEXT,
    "balance_after" INTEGER NOT NULL,
    "metadata_json" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing"."providers" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing"."products" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "product_type" TEXT NOT NULL,
    "scope_type" TEXT NOT NULL,
    "scope_ref" TEXT,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing"."price_books" (
    "id" TEXT NOT NULL,
    "market_code" TEXT NOT NULL,
    "currency_code" TEXT NOT NULL,
    "language_code" TEXT NOT NULL,
    "tax_mode" TEXT NOT NULL DEFAULT 'exclusive',
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "price_books_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing"."prices" (
    "id" TEXT NOT NULL,
    "billing_product_id" TEXT NOT NULL,
    "provider_id" TEXT,
    "price_book_id" TEXT,
    "external_price_id" TEXT,
    "amount_minor" INTEGER NOT NULL,
    "billing_period" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing"."orders" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "provider_id" TEXT,
    "billing_product_id" TEXT NOT NULL,
    "price_id" TEXT,
    "status" "billing"."BillingOrderStatus" NOT NULL DEFAULT 'PENDING',
    "currency_code" TEXT NOT NULL,
    "total_minor" INTEGER NOT NULL,
    "external_order_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing"."subscriptions" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "provider_id" TEXT,
    "billing_product_id" TEXT NOT NULL,
    "external_subscription_id" TEXT,
    "status" "billing"."BillingSubscriptionStatus" NOT NULL DEFAULT 'TRIALING',
    "current_period_start" TIMESTAMPTZ(6),
    "current_period_end" TIMESTAMPTZ(6),
    "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing"."webhook_events" (
    "id" TEXT NOT NULL,
    "provider_id" TEXT,
    "external_event_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "payload_json" JSONB NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "processed_at" TIMESTAMPTZ(6),
    "processing_status" TEXT NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "economics"."provider_rates" (
    "id" TEXT NOT NULL,
    "provider_code" TEXT NOT NULL,
    "model_code" TEXT,
    "unit_type" TEXT NOT NULL,
    "cost_per_unit" DECIMAL(18,6) NOT NULL,
    "currency_code" TEXT NOT NULL,
    "effective_from" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "provider_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "economics"."feature_cost_models" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "feature_code" TEXT NOT NULL,
    "cost_formula_type" TEXT NOT NULL,
    "config_json" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "feature_cost_models_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "economics"."usage_events" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "feature_code" TEXT NOT NULL,
    "provider_code" TEXT NOT NULL,
    "model_code" TEXT,
    "raw_units_json" JSONB NOT NULL,
    "internal_cost_minor" INTEGER NOT NULL,
    "credits_charged" INTEGER NOT NULL,
    "margin_snapshot_minor" INTEGER,
    "operation_key" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "usage_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "economics"."rollups_daily" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "product_id" TEXT NOT NULL,
    "feature_code" TEXT NOT NULL,
    "revenue_minor" INTEGER NOT NULL,
    "cost_minor" INTEGER NOT NULL,
    "margin_minor" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "rollups_daily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics"."attribution_profiles" (
    "id" TEXT NOT NULL,
    "account_id" TEXT,
    "user_id" TEXT NOT NULL,
    "first_touch_json" JSONB,
    "last_touch_json" JSONB,
    "normalized_click_ids_json" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "attribution_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics"."events" (
    "id" TEXT NOT NULL,
    "account_id" TEXT,
    "user_id" TEXT,
    "product_id" TEXT,
    "event_name" TEXT NOT NULL,
    "event_payload_json" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comms"."user_preferences" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "realm_code" TEXT NOT NULL,
    "email_marketing_allowed" BOOLEAN NOT NULL DEFAULT false,
    "push_marketing_allowed" BOOLEAN NOT NULL DEFAULT false,
    "product_updates_allowed" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comms"."push_subscriptions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "product_id" TEXT,
    "endpoint" TEXT NOT NULL,
    "keys_json" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit"."logs" (
    "id" TEXT NOT NULL,
    "account_id" TEXT,
    "user_id" TEXT,
    "action_code" TEXT NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" TEXT,
    "payload_json" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "motrend"."templates" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "duration_sec" INTEGER NOT NULL DEFAULT 10,
    "reference_video_url" TEXT,
    "metadata_json" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "motrend"."jobs" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "template_id" TEXT NOT NULL,
    "selection_kind" "motrend"."MotrendSelectionKind" NOT NULL,
    "status" "motrend"."MotrendJobStatus" NOT NULL DEFAULT 'AWAITING_UPLOAD',
    "input_image_path" TEXT NOT NULL,
    "input_image_url" TEXT,
    "reference_video_path" TEXT,
    "reference_video_url" TEXT,
    "debited_credits" INTEGER,
    "final_cost_credits" INTEGER,
    "refund_credits" INTEGER,
    "provider_task_id" TEXT,
    "provider_state" TEXT,
    "provider_output_url" TEXT,
    "provider_watermark_url" TEXT,
    "billing_source" TEXT,
    "billing_duration_sec" INTEGER,
    "billing_raw_duration_sec" DOUBLE PRECISION,
    "output_duration_sec" INTEGER,
    "output_raw_duration_sec" DOUBLE PRECISION,
    "reconciliation_error" TEXT,
    "finalized_at" TIMESTAMPTZ(6),
    "last_status_check_at" TIMESTAMPTZ(6),
    "metadata_json" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "motrend"."job_requests" (
    "id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "client_request_id" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "job_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "motrend"."download_artifacts" (
    "id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "artifact_type" "motrend"."MotrendDownloadArtifactType" NOT NULL,
    "storage_path" TEXT NOT NULL,
    "download_token" TEXT NOT NULL,
    "file_name" TEXT,
    "content_type" TEXT,
    "size_bytes" INTEGER,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "metadata_json" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "download_artifacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "motrend"."job_tasks" (
    "id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "task_type" "motrend"."MotrendTaskType" NOT NULL,
    "status" "motrend"."MotrendTaskStatus" NOT NULL DEFAULT 'QUEUED',
    "provider_code" TEXT NOT NULL DEFAULT 'kling',
    "operation_key" TEXT NOT NULL,
    "not_before_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimed_at" TIMESTAMPTZ(6),
    "lease_until" TIMESTAMPTZ(6),
    "processed_at" TIMESTAMPTZ(6),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "payload_json" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "job_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aeo"."scans" (
    "id" TEXT NOT NULL,
    "account_id" TEXT,
    "user_id" TEXT,
    "anonymous_session_id" TEXT,
    "site_url" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "public_score" INTEGER,
    "recommendations_locked" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "scans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aeo"."scan_reports" (
    "id" TEXT NOT NULL,
    "scan_id" TEXT NOT NULL,
    "ruleset_version" TEXT NOT NULL,
    "prompt_version" TEXT NOT NULL,
    "report_json" JSONB NOT NULL,
    "recommendations_json" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "scan_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aeo"."scan_claims" (
    "id" TEXT NOT NULL,
    "scan_id" TEXT NOT NULL,
    "claim_token" TEXT NOT NULL,
    "claimed_by_user_id" TEXT,
    "claimed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "scan_claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ugc"."projects" (
    "id" TEXT NOT NULL,
    "account_id" TEXT,
    "user_id" TEXT,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_firebase_uid_key" ON "identity"."users"("firebase_uid");

-- CreateIndex
CREATE UNIQUE INDEX "login_identities_provider_provider_subject_key" ON "identity"."login_identities"("provider", "provider_subject");

-- CreateIndex
CREATE UNIQUE INDEX "account_members_account_id_user_id_key" ON "core"."account_members"("account_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "support_profiles_support_code_key" ON "core"."support_profiles"("support_code");

-- CreateIndex
CREATE UNIQUE INDEX "support_profiles_account_id_key" ON "core"."support_profiles"("account_id");

-- CreateIndex
CREATE UNIQUE INDEX "realms_code_key" ON "catalog"."realms"("code");

-- CreateIndex
CREATE UNIQUE INDEX "products_code_key" ON "catalog"."products"("code");

-- CreateIndex
CREATE UNIQUE INDEX "products_entry_domain_key" ON "catalog"."products"("entry_domain");

-- CreateIndex
CREATE UNIQUE INDEX "features_product_id_code_key" ON "catalog"."features"("product_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "product_memberships_account_id_product_id_key" ON "access"."product_memberships"("account_id", "product_id");

-- CreateIndex
CREATE INDEX "entitlements_account_id_product_id_feature_code_status_idx" ON "access"."entitlements"("account_id", "product_id", "feature_code", "status");

-- CreateIndex
CREATE UNIQUE INDEX "wallets_account_id_wallet_scope_currency_code_scope_ref_key" ON "wallet"."wallets"("account_id", "wallet_scope", "currency_code", "scope_ref");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_entries_operation_key_key" ON "wallet"."ledger_entries"("operation_key");

-- CreateIndex
CREATE INDEX "ledger_entries_wallet_id_created_at_idx" ON "wallet"."ledger_entries"("wallet_id", "created_at");

-- CreateIndex
CREATE INDEX "ledger_entries_account_id_created_at_idx" ON "wallet"."ledger_entries"("account_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "providers_code_key" ON "billing"."providers"("code");

-- CreateIndex
CREATE UNIQUE INDEX "products_code_key" ON "billing"."products"("code");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_events_idempotency_key_key" ON "billing"."webhook_events"("idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_events_provider_id_external_event_id_key" ON "billing"."webhook_events"("provider_id", "external_event_id");

-- CreateIndex
CREATE UNIQUE INDEX "usage_events_operation_key_key" ON "economics"."usage_events"("operation_key");

-- CreateIndex
CREATE UNIQUE INDEX "rollups_daily_date_product_id_feature_code_key" ON "economics"."rollups_daily"("date", "product_id", "feature_code");

-- CreateIndex
CREATE UNIQUE INDEX "attribution_profiles_user_id_key" ON "analytics"."attribution_profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_preferences_user_id_realm_code_key" ON "comms"."user_preferences"("user_id", "realm_code");

-- CreateIndex
CREATE UNIQUE INDEX "push_subscriptions_user_id_endpoint_key" ON "comms"."push_subscriptions"("user_id", "endpoint");

-- CreateIndex
CREATE UNIQUE INDEX "templates_product_id_code_key" ON "motrend"."templates"("product_id", "code");

-- CreateIndex
CREATE INDEX "jobs_account_id_status_idx" ON "motrend"."jobs"("account_id", "status");

-- CreateIndex
CREATE INDEX "jobs_user_id_created_at_idx" ON "motrend"."jobs"("user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "job_requests_idempotency_key_key" ON "motrend"."job_requests"("idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "download_artifacts_job_id_artifact_type_key" ON "motrend"."download_artifacts"("job_id", "artifact_type");

-- CreateIndex
CREATE UNIQUE INDEX "job_tasks_operation_key_key" ON "motrend"."job_tasks"("operation_key");

-- CreateIndex
CREATE INDEX "job_tasks_status_not_before_at_idx" ON "motrend"."job_tasks"("status", "not_before_at");

-- CreateIndex
CREATE INDEX "job_tasks_job_id_task_type_status_idx" ON "motrend"."job_tasks"("job_id", "task_type", "status");

-- CreateIndex
CREATE UNIQUE INDEX "scan_claims_scan_id_claim_token_key" ON "aeo"."scan_claims"("scan_id", "claim_token");

-- AddForeignKey
ALTER TABLE "identity"."login_identities" ADD CONSTRAINT "login_identities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "identity"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."accounts" ADD CONSTRAINT "accounts_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "identity"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."account_members" ADD CONSTRAINT "account_members_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "core"."accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."account_members" ADD CONSTRAINT "account_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "identity"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."support_profiles" ADD CONSTRAINT "support_profiles_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "core"."accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."support_profiles" ADD CONSTRAINT "support_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "identity"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalog"."products" ADD CONSTRAINT "products_realm_id_fkey" FOREIGN KEY ("realm_id") REFERENCES "catalog"."realms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalog"."features" ADD CONSTRAINT "features_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "catalog"."products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalog"."cross_sell_rules" ADD CONSTRAINT "cross_sell_rules_source_product_id_fkey" FOREIGN KEY ("source_product_id") REFERENCES "catalog"."products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalog"."cross_sell_rules" ADD CONSTRAINT "cross_sell_rules_target_product_id_fkey" FOREIGN KEY ("target_product_id") REFERENCES "catalog"."products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access"."product_memberships" ADD CONSTRAINT "product_memberships_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "core"."accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access"."product_memberships" ADD CONSTRAINT "product_memberships_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "catalog"."products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access"."entitlements" ADD CONSTRAINT "entitlements_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "core"."accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access"."entitlements" ADD CONSTRAINT "entitlements_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "catalog"."products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet"."wallets" ADD CONSTRAINT "wallets_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "core"."accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet"."ledger_entries" ADD CONSTRAINT "ledger_entries_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallet"."wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet"."ledger_entries" ADD CONSTRAINT "ledger_entries_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "core"."accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet"."ledger_entries" ADD CONSTRAINT "ledger_entries_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "catalog"."products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing"."prices" ADD CONSTRAINT "prices_billing_product_id_fkey" FOREIGN KEY ("billing_product_id") REFERENCES "billing"."products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing"."prices" ADD CONSTRAINT "prices_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "billing"."providers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing"."prices" ADD CONSTRAINT "prices_price_book_id_fkey" FOREIGN KEY ("price_book_id") REFERENCES "billing"."price_books"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing"."orders" ADD CONSTRAINT "orders_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "core"."accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing"."orders" ADD CONSTRAINT "orders_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "billing"."providers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing"."orders" ADD CONSTRAINT "orders_billing_product_id_fkey" FOREIGN KEY ("billing_product_id") REFERENCES "billing"."products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing"."orders" ADD CONSTRAINT "orders_price_id_fkey" FOREIGN KEY ("price_id") REFERENCES "billing"."prices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing"."subscriptions" ADD CONSTRAINT "subscriptions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "core"."accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing"."subscriptions" ADD CONSTRAINT "subscriptions_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "billing"."providers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing"."subscriptions" ADD CONSTRAINT "subscriptions_billing_product_id_fkey" FOREIGN KEY ("billing_product_id") REFERENCES "billing"."products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing"."webhook_events" ADD CONSTRAINT "webhook_events_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "billing"."providers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "economics"."feature_cost_models" ADD CONSTRAINT "feature_cost_models_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "catalog"."products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "economics"."usage_events" ADD CONSTRAINT "usage_events_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "core"."accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "economics"."usage_events" ADD CONSTRAINT "usage_events_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "catalog"."products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analytics"."attribution_profiles" ADD CONSTRAINT "attribution_profiles_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "core"."accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analytics"."attribution_profiles" ADD CONSTRAINT "attribution_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "identity"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analytics"."events" ADD CONSTRAINT "events_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "core"."accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analytics"."events" ADD CONSTRAINT "events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "identity"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analytics"."events" ADD CONSTRAINT "events_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "catalog"."products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comms"."user_preferences" ADD CONSTRAINT "user_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "identity"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comms"."push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "identity"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comms"."push_subscriptions" ADD CONSTRAINT "push_subscriptions_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "catalog"."products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit"."logs" ADD CONSTRAINT "logs_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "core"."accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit"."logs" ADD CONSTRAINT "logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "identity"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "motrend"."jobs" ADD CONSTRAINT "jobs_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "core"."accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "motrend"."jobs" ADD CONSTRAINT "jobs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "identity"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "motrend"."job_requests" ADD CONSTRAINT "job_requests_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "motrend"."jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "motrend"."job_requests" ADD CONSTRAINT "job_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "identity"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "motrend"."download_artifacts" ADD CONSTRAINT "download_artifacts_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "motrend"."jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "motrend"."job_tasks" ADD CONSTRAINT "job_tasks_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "motrend"."jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aeo"."scans" ADD CONSTRAINT "scans_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "core"."accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aeo"."scans" ADD CONSTRAINT "scans_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "identity"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aeo"."scan_reports" ADD CONSTRAINT "scan_reports_scan_id_fkey" FOREIGN KEY ("scan_id") REFERENCES "aeo"."scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aeo"."scan_claims" ADD CONSTRAINT "scan_claims_scan_id_fkey" FOREIGN KEY ("scan_id") REFERENCES "aeo"."scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aeo"."scan_claims" ADD CONSTRAINT "scan_claims_claimed_by_user_id_fkey" FOREIGN KEY ("claimed_by_user_id") REFERENCES "identity"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ugc"."projects" ADD CONSTRAINT "projects_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "core"."accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ugc"."projects" ADD CONSTRAINT "projects_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "identity"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

