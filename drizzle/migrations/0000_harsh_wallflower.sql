CREATE TYPE "public"."tenant_role" AS ENUM('TENANT_OWNER', 'TENANT_ADMIN', 'HUB_OPERATOR', 'SETTLEMENT_OFFICER', 'COMPLIANCE_OFFICER', 'DEVELOPER', 'READ_ONLY', 'REGULATOR_OBSERVER');--> statement-breakpoint
CREATE TYPE "public"."tenant_status" AS ENUM('pending', 'active', 'suspended', 'closed');--> statement-breakpoint
CREATE TYPE "public"."tenant_tier" AS ENUM('STARTER', 'GROWTH', 'ENTERPRISE', 'SOVEREIGN');--> statement-breakpoint
CREATE TYPE "public"."alias_type" AS ENUM('PHONE', 'EMAIL', 'BVN', 'NIN', 'ACCOUNT_NUMBER', 'NUBAN', 'VIRTUAL_ACCOUNT');--> statement-breakpoint
CREATE TYPE "public"."biometric_status" AS ENUM('PENDING', 'VERIFIED', 'FAILED', 'EXPIRED', 'REVOKED');--> statement-breakpoint
CREATE TYPE "public"."chargeback_status" AS ENUM('PENDING', 'SUBMITTED', 'PROCESSED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."dispute_decision" AS ENUM('UPHELD', 'REJECTED', 'SPLIT', 'WITHDRAWN', 'TIMED_OUT');--> statement-breakpoint
CREATE TYPE "public"."dispute_workflow_status" AS ENUM('RAISED', 'EVIDENCE_COLLECTION', 'ML_SCORING', 'UNDER_REVIEW', 'DECISION_ISSUED', 'CHARGEBACK_INITIATED', 'APPEALED', 'CLOSED', 'TIMED_OUT');--> statement-breakpoint
CREATE TYPE "public"."hsm_key_status" AS ENUM('ACTIVE', 'INACTIVE', 'COMPROMISED', 'EXPIRED', 'DESTROYED', 'PENDING_ROTATION');--> statement-breakpoint
CREATE TYPE "public"."hsm_key_type" AS ENUM('RSA_2048', 'RSA_4096', 'EC_P256', 'EC_P384', 'AES_256', 'HMAC_SHA256');--> statement-breakpoint
CREATE TYPE "public"."hsm_operation_type" AS ENUM('SIGN', 'VERIFY', 'COMPUTE_MAC', 'VERIFY_MAC', 'ENCRYPT', 'DECRYPT', 'GENERATE_KEY_PAIR', 'IMPORT_KEY', 'EXPORT_PUBLIC_KEY', 'DESTROY_KEY');--> statement-breakpoint
CREATE TYPE "public"."rtgs_submission_status" AS ENUM('PENDING', 'SUBMITTED', 'ACKNOWLEDGED', 'SETTLED', 'REJECTED', 'FAILED', 'TIMED_OUT');--> statement-breakpoint
CREATE TYPE "public"."ai_decision_type" AS ENUM('APPROVE', 'REVIEW', 'BLOCK', 'FLAG');--> statement-breakpoint
CREATE TYPE "public"."ai_model_status" AS ENUM('training', 'active', 'archived', 'failed');--> statement-breakpoint
CREATE TYPE "public"."ai_model_type" AS ENUM('gnn_fraud', 'credit_scoring', 'anomaly_detection', 'churn_prediction', 'aml_detection');--> statement-breakpoint
CREATE TYPE "public"."billing_config_status" AS ENUM('draft', 'active', 'superseded', 'archived');--> statement-breakpoint
CREATE TYPE "public"."bnpl_repayment_status" AS ENUM('pending', 'paid', 'overdue', 'waived', 'failed');--> statement-breakpoint
CREATE TYPE "public"."bnpl_status" AS ENUM('pending', 'active', 'completed', 'paid', 'defaulted', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."card_brand" AS ENUM('visa', 'mastercard');--> statement-breakpoint
CREATE TYPE "public"."card_status" AS ENUM('active', 'frozen', 'terminated');--> statement-breakpoint
CREATE TYPE "public"."dispute_status" AS ENUM('open', 'under_review', 'resolved_merchant', 'resolved_customer', 'closed');--> statement-breakpoint
CREATE TYPE "public"."env_type" AS ENUM('test', 'live');--> statement-breakpoint
CREATE TYPE "public"."fraud_alert_status" AS ENUM('open', 'investigating', 'resolved', 'false_positive');--> statement-breakpoint
CREATE TYPE "public"."fraud_alert_type" AS ENUM('velocity_breach', 'card_testing', 'unusual_location', 'account_takeover', 'chargeback_pattern', 'identity_mismatch', 'device_fingerprint', 'ip_blacklist');--> statement-breakpoint
CREATE TYPE "public"."gnn_job_status" AS ENUM('queued', 'running', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."invite_code_type" AS ENUM('merchant', 'partner', 'admin', 'consumer', 'team_member');--> statement-breakpoint
CREATE TYPE "public"."kyc_doc_type" AS ENUM('passport', 'national_id', 'drivers_license', 'utility_bill', 'bank_statement', 'cac_certificate');--> statement-breakpoint
CREATE TYPE "public"."kyc_status" AS ENUM('not_started', 'pending', 'under_review', 'approved', 'rejected', 'expired');--> statement-breakpoint
CREATE TYPE "public"."liveness_decision" AS ENUM('real', 'spoof', 'uncertain');--> statement-breakpoint
CREATE TYPE "public"."merchant_status" AS ENUM('pending', 'active', 'suspended', 'closed');--> statement-breakpoint
CREATE TYPE "public"."mm_recon_status" AS ENUM('matched', 'unmatched', 'disputed', 'pending');--> statement-breakpoint
CREATE TYPE "public"."offline_queue_priority" AS ENUM('critical', 'high', 'normal', 'low');--> statement-breakpoint
CREATE TYPE "public"."offline_queue_status" AS ENUM('pending', 'syncing', 'synced', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."onboarding_step" AS ENUM('invite_code', 'company_info', 'branding', 'fee_structure', 'review', 'completed');--> statement-breakpoint
CREATE TYPE "public"."overhead_cost_category" AS ENUM('infrastructure', 'labor', 'travel', 'marketing', 'compliance', 'support', 'other');--> statement-breakpoint
CREATE TYPE "public"."payout_status" AS ENUM('pending_approval', 'pending', 'processing', 'completed', 'failed', 'cancelled', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."pos_terminal_model" AS ENUM('soundbox_basic', 'pos_lite', 'pos_smart', 'ussd_terminal');--> statement-breakpoint
CREATE TYPE "public"."pos_terminal_status" AS ENUM('active', 'inactive', 'maintenance', 'stolen');--> statement-breakpoint
CREATE TYPE "public"."pricing_model" AS ENUM('per_transaction', 'subscription', 'hybrid');--> statement-breakpoint
CREATE TYPE "public"."ptsp_batch_status" AS ENUM('pending', 'submitted', 'confirmed', 'failed', 'partial');--> statement-breakpoint
CREATE TYPE "public"."restaurant_order_status" AS ENUM('open', 'sent_to_kitchen', 'ready', 'paid', 'voided');--> statement-breakpoint
CREATE TYPE "public"."restaurant_table_status" AS ENUM('available', 'occupied', 'reserved', 'cleaning');--> statement-breakpoint
CREATE TYPE "public"."risk_level" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "public"."settlement_freq" AS ENUM('daily', 'weekly', 'monthly');--> statement-breakpoint
CREATE TYPE "public"."settlement_status" AS ENUM('pending', 'processing', 'completed', 'failed', 'sla_breached');--> statement-breakpoint
CREATE TYPE "public"."sso_protocol_enum" AS ENUM('saml', 'oidc', 'oauth2');--> statement-breakpoint
CREATE TYPE "public"."stripe_sub_status" AS ENUM('active', 'past_due', 'canceled', 'trialing', 'incomplete', 'paused');--> statement-breakpoint
CREATE TYPE "public"."subscription_interval" AS ENUM('daily', 'weekly', 'monthly', 'quarterly', 'annually');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('active', 'paused', 'cancelled', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."team_role" AS ENUM('admin', 'developer', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."team_status" AS ENUM('invited', 'active', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."tenant_invoice_status" AS ENUM('draft', 'open', 'paid', 'void', 'uncollectible');--> statement-breakpoint
CREATE TYPE "public"."tenant_plan" AS ENUM('starter', 'growth', 'enterprise');--> statement-breakpoint
CREATE TYPE "public"."tx_channel" AS ENUM('card', 'bank_transfer', 'mobile_money', 'ussd', 'qr', 'bnpl');--> statement-breakpoint
CREATE TYPE "public"."tx_status" AS ENUM('pending', 'processing', 'completed', 'failed', 'reversed');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'user');--> statement-breakpoint
CREATE TYPE "public"."ussd_status" AS ENUM('active', 'completed', 'failed', 'timeout');--> statement-breakpoint
CREATE TYPE "public"."webhook_delivery_status" AS ENUM('pending', 'success', 'failed', 'retrying');--> statement-breakpoint
CREATE TABLE "nqr_merchant_profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"merchant_name" text NOT NULL,
	"tenant_id" text,
	"dfsp_id" text,
	"bank_code" text NOT NULL,
	"account_number" text NOT NULL,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"static_qr_string" text,
	"static_qr_svg" text,
	"static_qr_png_base64" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"total_transactions" integer DEFAULT 0 NOT NULL,
	"total_amount_kobo" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "nqr_merchant_profiles_merchant_id_unique" UNIQUE("merchant_id")
);
--> statement-breakpoint
CREATE TABLE "nqr_transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"reference" text NOT NULL,
	"merchant_id" text NOT NULL,
	"merchant_name" text NOT NULL,
	"tenant_id" text,
	"dfsp_id" text,
	"amount_kobo" bigint,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"qr_type" text DEFAULT 'DYNAMIC' NOT NULL,
	"qr_string" text NOT NULL,
	"qr_svg" text,
	"qr_png_base64" text,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"paid_amount_kobo" bigint,
	"payer_account_number" text,
	"payer_bank_code" text,
	"nibss_session_id" text,
	"nibss_response_code" text,
	"webhook_received_at" timestamp,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "nqr_transactions_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE "tenant_api_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"name" text NOT NULL,
	"key_hash" text NOT NULL,
	"key_prefix" text NOT NULL,
	"scopes" jsonb NOT NULL,
	"rate_limit" integer DEFAULT 1000 NOT NULL,
	"last_used_at" timestamp,
	"expires_at" timestamp,
	"revoked_at" timestamp,
	"created_by" integer,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "tenant_api_keys_key_hash_unique" UNIQUE("key_hash")
);
--> statement-breakpoint
CREATE TABLE "tenant_audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"actor_id" integer,
	"actor_email" text,
	"action" text NOT NULL,
	"resource_type" text,
	"resource_id" text,
	"old_value" jsonb,
	"new_value" jsonb,
	"ip_address" text,
	"user_agent" text,
	"request_id" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "tenant_branding" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"display_name" text NOT NULL,
	"tagline" text,
	"logo_url" text,
	"favicon_url" text,
	"logomark_url" text,
	"primary_color" text DEFAULT '#1a56db' NOT NULL,
	"primary_foreground" text DEFAULT '#ffffff' NOT NULL,
	"secondary_color" text DEFAULT '#7e3af2' NOT NULL,
	"accent_color" text DEFAULT '#0694a2' NOT NULL,
	"background_color" text DEFAULT '#f9fafb' NOT NULL,
	"surface_color" text DEFAULT '#ffffff' NOT NULL,
	"border_color" text DEFAULT '#e5e7eb' NOT NULL,
	"error_color" text DEFAULT '#f05252' NOT NULL,
	"success_color" text DEFAULT '#0e9f6e' NOT NULL,
	"warning_color" text DEFAULT '#ff5a1f' NOT NULL,
	"font_family" text DEFAULT 'Inter' NOT NULL,
	"font_family_mono" text DEFAULT 'JetBrains Mono' NOT NULL,
	"font_size_base" text DEFAULT '16px' NOT NULL,
	"border_radius" text DEFAULT '0.5rem' NOT NULL,
	"custom_domain" text,
	"custom_domain_verified" boolean DEFAULT false NOT NULL,
	"tls_cert_arn" text,
	"compiled_css_url" text,
	"compiled_css_version" text,
	"compiled_css_hash" text,
	"email_from_name" text,
	"email_from_address" text,
	"email_header_color" text,
	"custom_config" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "tenant_members" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"user_id" integer NOT NULL,
	"role" "tenant_role" DEFAULT 'READ_ONLY' NOT NULL,
	"permissions" jsonb,
	"invited_by" integer,
	"invited_at" timestamp DEFAULT now(),
	"accepted_at" timestamp,
	"revoked_at" timestamp,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"status" "tenant_status" DEFAULT 'pending' NOT NULL,
	"plan" "tenant_plan" DEFAULT 'starter' NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"country" text DEFAULT 'NG' NOT NULL,
	"logo_url" text,
	"primary_color" text DEFAULT '#6366f1',
	"accent_color" text DEFAULT '#8b5cf6',
	"font_family" text DEFAULT 'Inter',
	"favicon_url" text,
	"secondary_color" text DEFAULT '#a78bfa',
	"footer_text" text,
	"support_email" text,
	"custom_domain" text,
	"max_merchants" integer DEFAULT 10 NOT NULL,
	"max_consumers" integer DEFAULT 10000 NOT NULL,
	"max_daily_volume" bigint DEFAULT 100000000 NOT NULL,
	"bnpl_enabled" boolean DEFAULT false NOT NULL,
	"cross_border_enabled" boolean DEFAULT false NOT NULL,
	"virtual_cards_enabled" boolean DEFAULT false NOT NULL,
	"kafka_topic_prefix" text,
	"permify_tenant_id" text,
	"tigerbeetle_ledger_id" bigint,
	"provisioned_by" text,
	"provisioned_at" timestamp,
	"suspended_at" timestamp,
	"suspend_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tenants_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "biometric_verifications" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"requesting_dfsp" varchar(36) NOT NULL,
	"verification_type" varchar(10) NOT NULL,
	"identifier_hash" varchar(64) NOT NULL,
	"status" "biometric_status" NOT NULL,
	"match_score" integer,
	"nibss_request_id" varchar(128),
	"nibss_response_code" varchar(10),
	"nibss_response_msg" text,
	"verified_at" timestamp,
	"expires_at" timestamp,
	"correlation_id" varchar(64),
	"transfer_id" varchar(36),
	"onboarding_session_id" varchar(36),
	"response_time_ms" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cb_liquidity_positions" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"dfsp_id" varchar(36) NOT NULL,
	"settlement_window_id" varchar(36),
	"currency" varchar(3) DEFAULT 'NGN' NOT NULL,
	"opening_balance_kobo" bigint DEFAULT 0 NOT NULL,
	"settled_kobo" bigint DEFAULT 0 NOT NULL,
	"pending_kobo" bigint DEFAULT 0 NOT NULL,
	"closing_balance_kobo" bigint,
	"rtgs_submission_count" integer DEFAULT 0 NOT NULL,
	"last_rtgs_ref" varchar(128),
	"position_date" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dict_aliases" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"alias_type" "alias_type" NOT NULL,
	"alias_value" varchar(256) NOT NULL,
	"alias_hash" varchar(64) NOT NULL,
	"owner_name" varchar(256) NOT NULL,
	"owner_bvn" varchar(11),
	"owner_nin" varchar(11),
	"dfsp_id" varchar(36) NOT NULL,
	"account_number" varchar(20),
	"bank_code" varchar(10),
	"is_active" boolean DEFAULT true NOT NULL,
	"is_verified" boolean DEFAULT false NOT NULL,
	"verified_at" timestamp,
	"expires_at" timestamp,
	"registered_at" timestamp DEFAULT now() NOT NULL,
	"deregistered_at" timestamp,
	"deregistration_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "dispute_chargebacks" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"workflow_id" varchar(36) NOT NULL,
	"decision_id" varchar(36) NOT NULL,
	"from_dfsp" varchar(36) NOT NULL,
	"to_dfsp" varchar(36) NOT NULL,
	"amount_kobo" bigint NOT NULL,
	"currency" varchar(3) DEFAULT 'NGN' NOT NULL,
	"status" chargeback_status DEFAULT 'PENDING' NOT NULL,
	"settlement_window_id" varchar(36),
	"rtgs_submission_id" varchar(36),
	"processed_at" timestamp,
	"failure_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dispute_decisions" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"workflow_id" varchar(36) NOT NULL,
	"decision" "dispute_decision" NOT NULL,
	"decided_by" varchar(64) NOT NULL,
	"reasoning" text NOT NULL,
	"ml_recommendation" varchar(32),
	"ml_confidence" integer,
	"payer_liability_pct" integer DEFAULT 0 NOT NULL,
	"payee_liability_pct" integer DEFAULT 0 NOT NULL,
	"chargeback_amount_kobo" bigint,
	"is_appealed" boolean DEFAULT false NOT NULL,
	"appealed_at" timestamp,
	"appeal_outcome" varchar(32),
	"decided_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "dispute_decisions_workflow_id_unique" UNIQUE("workflow_id")
);
--> statement-breakpoint
CREATE TABLE "dispute_evidence" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"workflow_id" varchar(36) NOT NULL,
	"submitted_by_dfsp" varchar(36) NOT NULL,
	"submitted_by" varchar(64) NOT NULL,
	"evidence_type" varchar(32) NOT NULL,
	"description" text NOT NULL,
	"file_url" text,
	"file_hash" varchar(64),
	"file_size_bytes" integer,
	"mime_type" varchar(128),
	"is_accepted" boolean,
	"review_notes" text,
	"reviewed_by" varchar(64),
	"reviewed_at" timestamp,
	"submitted_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dispute_ml_scores" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"workflow_id" varchar(36) NOT NULL,
	"model_version" varchar(32) NOT NULL,
	"fraud_score" integer NOT NULL,
	"recommendation" varchar(32) NOT NULL,
	"confidence" integer NOT NULL,
	"feature_vector" jsonb,
	"shap_values" jsonb,
	"scored_at" timestamp DEFAULT now() NOT NULL,
	"scoring_duration_ms" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dispute_workflows" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"temporal_workflow_id" varchar(128) NOT NULL,
	"temporal_run_id" varchar(128),
	"transfer_id" varchar(36) NOT NULL,
	"original_dispute_id" varchar(36),
	"payer_dfsp" varchar(36) NOT NULL,
	"payee_dfsp" varchar(36) NOT NULL,
	"amount_kobo" bigint NOT NULL,
	"currency" varchar(3) DEFAULT 'NGN' NOT NULL,
	"reason" text NOT NULL,
	"raised_by" varchar(64) NOT NULL,
	"status" "dispute_workflow_status" DEFAULT 'RAISED' NOT NULL,
	"evidence_deadline" timestamp NOT NULL,
	"sla_deadline" timestamp NOT NULL,
	"appeal_deadline" timestamp,
	"raised_at" timestamp DEFAULT now() NOT NULL,
	"closed_at" timestamp,
	"closure_reason" text,
	"ml_score_id" varchar(36),
	"decision_id" varchar(36),
	"chargeback_id" varchar(36),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"metadata" jsonb,
	CONSTRAINT "dispute_workflows_temporal_workflow_id_unique" UNIQUE("temporal_workflow_id")
);
--> statement-breakpoint
CREATE TABLE "hsm_keys" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"key_label" varchar(128) NOT NULL,
	"key_type" "hsm_key_type" NOT NULL,
	"key_status" "hsm_key_status" DEFAULT 'ACTIVE' NOT NULL,
	"slot_id" integer DEFAULT 0 NOT NULL,
	"purpose" varchar(64) NOT NULL,
	"algorithm" varchar(32) NOT NULL,
	"key_size_bytes" integer,
	"public_key_pem" text,
	"fingerprint" varchar(128),
	"generated_at" timestamp DEFAULT now() NOT NULL,
	"activated_at" timestamp,
	"expires_at" timestamp,
	"rotated_at" timestamp,
	"rotated_by_key_id" varchar(36),
	"destroyed_at" timestamp,
	"destroyed_by" varchar(64),
	"generated_by" varchar(64) NOT NULL,
	"hsm_serial_number" varchar(64),
	"hsm_firmware_version" varchar(32),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "hsm_operations" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"key_id" varchar(36) NOT NULL,
	"key_label" varchar(128) NOT NULL,
	"operation_type" "hsm_operation_type" NOT NULL,
	"caller_service" varchar(64) NOT NULL,
	"correlation_id" varchar(64),
	"transfer_id" varchar(36),
	"input_size_bytes" integer,
	"output_size_bytes" integer,
	"duration_ms" integer,
	"success" boolean NOT NULL,
	"error_code" varchar(32),
	"error_message" text,
	"hsm_slot_id" integer,
	"performed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "identity_lookups" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"requesting_dfsp" varchar(36) NOT NULL,
	"alias_type" "alias_type" NOT NULL,
	"alias_hash" varchar(64) NOT NULL,
	"resolved_alias_id" varchar(36),
	"found" boolean NOT NULL,
	"cache_hit" boolean DEFAULT false NOT NULL,
	"response_time_ms" integer,
	"correlation_id" varchar(64),
	"transfer_id" varchar(36),
	"ip_address" varchar(45),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "key_rotation_log" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"old_key_id" varchar(36) NOT NULL,
	"new_key_id" varchar(36) NOT NULL,
	"rotation_reason" varchar(64) NOT NULL,
	"initiated_by" varchar(64) NOT NULL,
	"approved_by" varchar(64),
	"rotation_started_at" timestamp NOT NULL,
	"rotation_completed_at" timestamp,
	"affected_services" jsonb,
	"rollback_available" boolean DEFAULT true NOT NULL,
	"rolled_back_at" timestamp,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rtgs_messages" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"submission_id" varchar(36) NOT NULL,
	"direction" varchar(8) NOT NULL,
	"message_type" varchar(32) NOT NULL,
	"raw_xml" text NOT NULL,
	"checksum" varchar(64) NOT NULL,
	"signed_by" varchar(64),
	"signature_hex" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rtgs_submissions" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"settlement_window_id" varchar(36),
	"message_id" varchar(64) NOT NULL,
	"end_to_end_id" varchar(64) NOT NULL,
	"rtgs_reference" varchar(128),
	"debtor_institution" varchar(50) NOT NULL,
	"creditor_institution" varchar(50) NOT NULL,
	"amount_kobo" bigint NOT NULL,
	"currency" varchar(3) DEFAULT 'NGN' NOT NULL,
	"status" "rtgs_submission_status" DEFAULT 'PENDING' NOT NULL,
	"submitted_at" timestamp,
	"acknowledged_at" timestamp,
	"settled_at" timestamp,
	"rejected_at" timestamp,
	"rejection_reason" text,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"max_retries" integer DEFAULT 3 NOT NULL,
	"next_retry_at" timestamp,
	"idempotency_key" varchar(128) NOT NULL,
	"kafka_offset" bigint,
	"kafka_partition" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"metadata" jsonb,
	CONSTRAINT "rtgs_submissions_message_id_unique" UNIQUE("message_id"),
	CONSTRAINT "rtgs_submissions_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "accessibility_fallback_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"submission_id" text,
	"reason" text NOT NULL,
	"review_status" text DEFAULT 'pending',
	"reviewed_by" text,
	"reviewed_at" timestamp,
	"review_notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_notification_prefs" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"push_enabled" boolean DEFAULT true NOT NULL,
	"email_enabled" boolean DEFAULT true NOT NULL,
	"slack_enabled" boolean DEFAULT false NOT NULL,
	"alert_new_merchant" boolean DEFAULT true NOT NULL,
	"alert_kyc_submission" boolean DEFAULT true NOT NULL,
	"alert_kyc_approval" boolean DEFAULT true NOT NULL,
	"alert_high_risk_txn" boolean DEFAULT true NOT NULL,
	"alert_fraud_escalation" boolean DEFAULT true NOT NULL,
	"alert_dispute_opened" boolean DEFAULT true NOT NULL,
	"alert_dispute_escalated" boolean DEFAULT true NOT NULL,
	"alert_payout_approval" boolean DEFAULT true NOT NULL,
	"alert_system_error" boolean DEFAULT true NOT NULL,
	"alert_bridge_down" boolean DEFAULT true NOT NULL,
	"alert_rate_limit" boolean DEFAULT false NOT NULL,
	"alert_daily_digest" boolean DEFAULT true NOT NULL,
	"alert_weekly_report" boolean DEFAULT true NOT NULL,
	"high_risk_score_threshold" integer DEFAULT 75 NOT NULL,
	"large_payout_threshold_kobo" integer DEFAULT 1000000000 NOT NULL,
	"login_anomaly_window_minutes" integer DEFAULT 15 NOT NULL,
	"login_anomaly_threshold" integer DEFAULT 5 NOT NULL,
	"notification_email" text,
	"digest_frequency" text DEFAULT 'daily' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "admin_notification_prefs_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "adverse_media_screenings" (
	"id" text PRIMARY KEY NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"merchant_id" text NOT NULL,
	"query" text NOT NULL,
	"provider" text DEFAULT 'llm_search',
	"result" text,
	"flagged" boolean DEFAULT false NOT NULL,
	"flag_reason" text,
	"reviewed_by" text,
	"reviewed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_banking_v4_agents" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"agent_code" text NOT NULL,
	"agent_name" text NOT NULL,
	"phone" text NOT NULL,
	"state" text DEFAULT 'Lagos' NOT NULL,
	"lga" text DEFAULT 'Ikeja' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"tier" text DEFAULT 'standard' NOT NULL,
	"float_balance" integer DEFAULT 0 NOT NULL,
	"daily_limit" integer DEFAULT 500000 NOT NULL,
	"total_transactions" integer DEFAULT 0 NOT NULL,
	"total_volume" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "agent_banking_v4_agents_agent_code_unique" UNIQUE("agent_code")
);
--> statement-breakpoint
CREATE TABLE "agent_network" (
	"id" serial PRIMARY KEY NOT NULL,
	"super_agent_merchant_id" text NOT NULL,
	"sub_agent_merchant_id" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"joined_at" timestamp DEFAULT now() NOT NULL,
	"total_volume_kobo" bigint DEFAULT 0 NOT NULL,
	"transaction_count" integer DEFAULT 0 NOT NULL,
	"fraud_incidents" integer DEFAULT 0 NOT NULL,
	"settlement_rate" integer DEFAULT 100 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_audit_trail" (
	"id" text PRIMARY KEY NOT NULL,
	"transaction_id" text,
	"merchant_id" text,
	"model_id" text,
	"decision" "ai_decision_type" NOT NULL,
	"confidence" real NOT NULL,
	"risk_score" real,
	"features" text,
	"explanation" text,
	"latency_ms" integer,
	"tools_used" text,
	"art_steps" integer,
	"overridden_by" text,
	"override_reason" text,
	"overridden_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_model_registry" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"model_type" "ai_model_type" NOT NULL,
	"version" text NOT NULL,
	"status" "ai_model_status" DEFAULT 'training' NOT NULL,
	"accuracy" real,
	"precision" real,
	"recall" real,
	"f1_score" real,
	"auc_roc" real,
	"feature_count" integer,
	"training_records" integer,
	"artifact_path" text,
	"hyperparameters" text,
	"trained_by" text,
	"trained_at" timestamp,
	"deployed_at" timestamp,
	"archived_at" timestamp,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "aml_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"rule_name" text NOT NULL,
	"rule_category" text NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"parameters" text NOT NULL,
	"action" text DEFAULT 'FLAG' NOT NULL,
	"effective_from" timestamp DEFAULT now() NOT NULL,
	"effective_to" timestamp,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "aml_rules_rule_name_unique" UNIQUE("rule_name")
);
--> statement-breakpoint
CREATE TABLE "anomaly_config_audit" (
	"id" serial PRIMARY KEY NOT NULL,
	"changed_by_user_id" integer NOT NULL,
	"is_global" boolean DEFAULT false NOT NULL,
	"old_window_minutes" integer,
	"old_threshold" integer,
	"new_window_minutes" integer NOT NULL,
	"new_threshold" integer NOT NULL,
	"changed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"merchant_id" text NOT NULL,
	"name" text NOT NULL,
	"key_hash" text NOT NULL,
	"key_prefix" text NOT NULL,
	"environment" "env_type" DEFAULT 'test' NOT NULL,
	"permissions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_used_at" timestamp,
	"revoked_at" timestamp,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "api_keys_key_hash_unique" UNIQUE("key_hash")
);
--> statement-breakpoint
CREATE TABLE "api_rate_limit_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"endpoint" text NOT NULL,
	"limit_per_minute" integer DEFAULT 60 NOT NULL,
	"limit_per_hour" integer DEFAULT 1000 NOT NULL,
	"limit_per_day" integer DEFAULT 10000 NOT NULL,
	"burst_limit" integer DEFAULT 10 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "apisix_consumers" (
	"id" text PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"dfsp_id" text,
	"plugins" text,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "apisix_consumers_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "apisix_routes" (
	"id" text PRIMARY KEY NOT NULL,
	"route_id" text NOT NULL,
	"dfsp_id" text,
	"name" text NOT NULL,
	"uri" text NOT NULL,
	"methods" text[] DEFAULT '{"GET","POST"}' NOT NULL,
	"upstream_url" text NOT NULL,
	"plugins" text,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "apisix_routes_route_id_unique" UNIQUE("route_id")
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"actor_id" text NOT NULL,
	"actor_name" text NOT NULL,
	"actor_email" text,
	"action" text NOT NULL,
	"resource" text NOT NULL,
	"resource_id" text,
	"metadata" jsonb,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text,
	"user_id" text,
	"action" text NOT NULL,
	"resource" text NOT NULL,
	"resource_id" text,
	"ip_address" text,
	"user_agent" text,
	"request_body" text,
	"response_status" integer,
	"metadata" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "audit_trail_events" (
	"id" text PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"actor_id" text NOT NULL,
	"actor_type" text NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" text NOT NULL,
	"action" text NOT NULL,
	"outcome" text NOT NULL,
	"metadata" text,
	"ip_address" text,
	"session_id" text,
	"lakehouse_synced" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "bill_payments" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"wallet_id" text NOT NULL,
	"category" text NOT NULL,
	"biller_code" text NOT NULL,
	"biller_name" text NOT NULL,
	"customer_reference" text NOT NULL,
	"amount_kobo" bigint NOT NULL,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"provider_ref" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"failure_reason" text,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"billing_config_id" text,
	"actor_id" text NOT NULL,
	"actor_role" text NOT NULL,
	"action" text NOT NULL,
	"before_state" jsonb,
	"after_state" jsonb,
	"reason" text,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_configs" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"status" "billing_config_status" DEFAULT 'draft' NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"pricing_model" "pricing_model" DEFAULT 'per_transaction' NOT NULL,
	"fee_rate" real DEFAULT 0.015 NOT NULL,
	"fee_cap_kobo" bigint DEFAULT 200000 NOT NULL,
	"fee_floor_kobo" bigint DEFAULT 0 NOT NULL,
	"platform_share" real DEFAULT 0.65 NOT NULL,
	"reseller_share" real DEFAULT 0.35 NOT NULL,
	"interchange_cost_kobo" bigint DEFAULT 5000 NOT NULL,
	"sign_on_fee_kobo" bigint DEFAULT 0 NOT NULL,
	"sign_on_platform_share" real DEFAULT 0.7 NOT NULL,
	"subscription_fee_kobo" bigint DEFAULT 0 NOT NULL,
	"subscription_platform_share" real DEFAULT 0.65 NOT NULL,
	"tb_merchant_payable_account" text,
	"tb_platform_revenue_account" text,
	"tb_reseller_payable_account" text,
	"tb_interchange_cost_account" text,
	"tb_sign_on_revenue_account" text,
	"monthly_overhead_cap_kobo" bigint DEFAULT 0,
	"effective_from" timestamp DEFAULT now() NOT NULL,
	"effective_to" timestamp,
	"created_by" text NOT NULL,
	"approved_by" text,
	"approved_at" timestamp,
	"notes" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_events" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"merchant_id" text NOT NULL,
	"reseller_id" text,
	"transaction_id" text NOT NULL,
	"amount_kobo" bigint NOT NULL,
	"gross_fee_kobo" bigint NOT NULL,
	"platform_revenue_kobo" bigint NOT NULL,
	"reseller_revenue_kobo" bigint NOT NULL,
	"interchange_cost_kobo" bigint NOT NULL,
	"net_platform_revenue_kobo" bigint NOT NULL,
	"pricing_model" "pricing_model" NOT NULL,
	"channel" text NOT NULL,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"occurred_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "billing_events_transaction_id_unique" UNIQUE("transaction_id")
);
--> statement-breakpoint
CREATE TABLE "bnpl_loans" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"merchant_id" text NOT NULL,
	"transaction_id" text,
	"customer_id" text,
	"principal_amount" bigint NOT NULL,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"installments" integer DEFAULT 3 NOT NULL,
	"installment_amount" bigint NOT NULL,
	"interest_rate" integer DEFAULT 0 NOT NULL,
	"status" "bnpl_status" DEFAULT 'pending' NOT NULL,
	"next_payment_at" timestamp,
	"completed_at" timestamp,
	"defaulted_at" timestamp,
	"customer_email" text,
	"customer_name" text,
	"paid_amount" bigint DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bnpl_plans" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"name" text NOT NULL,
	"installments" integer DEFAULT 3 NOT NULL,
	"interest_rate" integer DEFAULT 0 NOT NULL,
	"min_amount" bigint DEFAULT 5000 NOT NULL,
	"max_amount" bigint DEFAULT 500000 NOT NULL,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bnpl_repayment_schedules" (
	"id" text PRIMARY KEY NOT NULL,
	"bnpl_loan_id" text NOT NULL,
	"user_id" text NOT NULL,
	"instalment_number" integer NOT NULL,
	"total_instalments" integer NOT NULL,
	"principal_amount_ngn" real NOT NULL,
	"interest_amount_ngn" real DEFAULT 0 NOT NULL,
	"total_due_ngn" real NOT NULL,
	"due_date" timestamp NOT NULL,
	"paid_at" timestamp,
	"paid_amount_ngn" real,
	"status" "bnpl_repayment_status" DEFAULT 'pending' NOT NULL,
	"late_fee_ngn" real DEFAULT 0 NOT NULL,
	"payment_reference" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bulk_collection_items" (
	"id" text PRIMARY KEY NOT NULL,
	"collection_id" text NOT NULL,
	"customer_name" text NOT NULL,
	"customer_email" text,
	"customer_phone" text,
	"amount_kobo" bigint NOT NULL,
	"status" text DEFAULT 'pending',
	"payment_link_url" text,
	"paid_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bulk_collections" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"due_date" timestamp,
	"status" text DEFAULT 'pending',
	"total_amount_kobo" bigint DEFAULT 0,
	"count" integer DEFAULT 0,
	"collected" integer DEFAULT 0,
	"collected_amount_kobo" bigint DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bulk_payment_schedules" (
	"schedule_id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"schedule_name" text NOT NULL,
	"recipients" jsonb NOT NULL,
	"total_amount_kobo" bigint NOT NULL,
	"scheduled_at" timestamp NOT NULL,
	"status" text DEFAULT 'pending',
	"processed_count" integer DEFAULT 0,
	"failed_count" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "carbon_credit_transactions_v2" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"credit_id" text NOT NULL,
	"type" text DEFAULT 'purchase' NOT NULL,
	"quantity" integer DEFAULT 0 NOT NULL,
	"total_amount" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'completed' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "carbon_credits" (
	"credit_id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"project_id" text NOT NULL,
	"project_name" text NOT NULL,
	"tonnes" text NOT NULL,
	"price_per_tonne_kobo" bigint NOT NULL,
	"total_kobo" bigint NOT NULL,
	"vintage" text,
	"standard" text,
	"status" text DEFAULT 'pending',
	"retired_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "carbon_credits_v2" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"project_name" text NOT NULL,
	"project_type" text DEFAULT 'reforestation' NOT NULL,
	"country" text DEFAULT 'NG' NOT NULL,
	"vintage_year" integer DEFAULT 2024 NOT NULL,
	"quantity" integer DEFAULT 0 NOT NULL,
	"price_per_tonne" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'available' NOT NULL,
	"certification_body" text DEFAULT 'Gold Standard',
	"serial_number" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cashback_balances" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"cashback_balance_kobo" bigint DEFAULT 0,
	"total_earned_kobo" bigint DEFAULT 0,
	"total_redeemed_kobo" bigint DEFAULT 0,
	"pending_kobo" bigint DEFAULT 0,
	"tier" text DEFAULT 'bronze',
	"cashback_rate" text DEFAULT '0.02',
	"max_cashback_kobo" bigint DEFAULT 50000,
	"min_transaction_kobo" bigint DEFAULT 10000,
	"enabled" integer DEFAULT 1,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "cashback_balances_merchant_id_unique" UNIQUE("merchant_id")
);
--> statement-breakpoint
CREATE TABLE "cashback_transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"type" text NOT NULL,
	"amount_kobo" bigint NOT NULL,
	"description" text,
	"related_transaction_id" text,
	"status" text DEFAULT 'completed',
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cbdc_accounts" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"rail" varchar(16) NOT NULL,
	"wallet_id" varchar(128) NOT NULL,
	"owner_id" varchar(64) NOT NULL,
	"owner_type" varchar(32) NOT NULL,
	"balance" double precision DEFAULT 0 NOT NULL,
	"currency" varchar(8) NOT NULL,
	"is_active" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "cbdc_transfers" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"rail" varchar(16) NOT NULL,
	"sender_wallet" varchar(128) NOT NULL,
	"receiver_wallet" varchar(128) NOT NULL,
	"amount" double precision NOT NULL,
	"currency" varchar(8) NOT NULL,
	"narration" varchar(256),
	"status" varchar(32) DEFAULT 'INITIATED' NOT NULL,
	"rail_ref" varchar(128),
	"tiger_beetle_ref" varchar(128),
	"created_by" varchar(64),
	"created_at" timestamp DEFAULT now(),
	"settled_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "chargebacks" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"transaction_id" text,
	"stripe_charge_id" text,
	"amount_kobo" integer NOT NULL,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"reason" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"due_date" timestamp,
	"evidence_submitted" boolean DEFAULT false NOT NULL,
	"evidence_deadline" timestamp,
	"evidence" text,
	"evidence_url" text,
	"evidence_file_name" text,
	"notes" text,
	"resolved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "claim_documents" (
	"id" text PRIMARY KEY NOT NULL,
	"claim_id" text NOT NULL,
	"user_id" integer NOT NULL,
	"file_name" text NOT NULL,
	"file_key" text NOT NULL,
	"file_url" text NOT NULL,
	"mime_type" text NOT NULL,
	"file_size_bytes" integer NOT NULL,
	"uploaded_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "collateral_deposits" (
	"id" text PRIMARY KEY NOT NULL,
	"dfsp_id" text NOT NULL,
	"amount_kobo" integer NOT NULL,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"bank_ref" text,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"ledger_entry_id" text,
	"workflow_id" text,
	"confirmed_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "compliance_check_results" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"check_type" text NOT NULL,
	"check_name" text NOT NULL,
	"score" integer DEFAULT 0 NOT NULL,
	"max_score" integer DEFAULT 100 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"findings" text,
	"recommendations" text,
	"evaluated_at" timestamp DEFAULT now(),
	"next_evaluation_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "compliance_reports" (
	"report_id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"verification_id" text,
	"report_type" text NOT NULL,
	"status" text DEFAULT 'pending',
	"risk_level" text,
	"findings" text,
	"generated_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consumer_budgets" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"category" text NOT NULL,
	"limit_kobo" integer NOT NULL,
	"spent_kobo" integer DEFAULT 0 NOT NULL,
	"period" text DEFAULT 'monthly' NOT NULL,
	"alert_at" integer DEFAULT 80 NOT NULL,
	"alert_sent" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"reset_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "consumer_cards" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"wallet_id" text NOT NULL,
	"masked_pan" text NOT NULL,
	"card_brand" text DEFAULT 'visa' NOT NULL,
	"expiry_month" text NOT NULL,
	"expiry_year" text NOT NULL,
	"cardholder_name" text NOT NULL,
	"spending_limit_kobo" bigint,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_frozen" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consumer_contacts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"contact_user_id" integer,
	"nickname" text,
	"phone" text,
	"account_number" text,
	"bank_code" text,
	"bank_name" text,
	"is_favorite" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consumer_disputes" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"wallet_txn_id" text,
	"merchant_dispute_id" text,
	"subject" text NOT NULL,
	"description" text NOT NULL,
	"category" text DEFAULT 'other' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"resolution" text,
	"evidence_urls" text,
	"resolved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consumer_finance_loans" (
	"loan_id" text PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"merchant_id" text NOT NULL,
	"amount_kobo" bigint NOT NULL,
	"outstanding_kobo" bigint NOT NULL,
	"status" text DEFAULT 'pending',
	"term_days" integer DEFAULT 30,
	"rate_annual_pct" text DEFAULT '0',
	"due_date" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consumer_fraud_flags" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"wallet_txn_id" text,
	"risk_score" integer DEFAULT 0 NOT NULL,
	"flag_reason" text NOT NULL,
	"flag_type" text DEFAULT 'ml_model' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"reviewed_at" timestamp,
	"reviewed_by" integer,
	"metadata" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consumer_idempotency_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"idempotency_key" text NOT NULL,
	"operation" text NOT NULL,
	"response_payload" text,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "consumer_idempotency_keys_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "consumer_insurance_claims" (
	"id" text PRIMARY KEY NOT NULL,
	"policy_id" text NOT NULL,
	"merchant_id" text NOT NULL,
	"description" text NOT NULL,
	"claim_amount_kobo" bigint NOT NULL,
	"approved_amount_kobo" bigint DEFAULT 0,
	"status" text DEFAULT 'submitted',
	"evidence_urls" jsonb,
	"resolved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consumer_insurance_policies" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"customer_id" text,
	"product_id" text NOT NULL,
	"product_name" text NOT NULL,
	"provider" text NOT NULL,
	"premium_kobo" bigint NOT NULL,
	"coverage_kobo" bigint NOT NULL,
	"status" text DEFAULT 'active',
	"start_date" timestamp DEFAULT now() NOT NULL,
	"end_date" timestamp,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consumer_kyc_records" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"phone" text,
	"bvn" text,
	"nin" text,
	"selfie_url" text,
	"id_doc_url" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"provider_ref" text,
	"rejection_reason" text,
	"verified_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "consumer_kyc_records_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "consumer_loyalty_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"points_balance" integer DEFAULT 0 NOT NULL,
	"lifetime_points" integer DEFAULT 0 NOT NULL,
	"tier" text DEFAULT 'bronze' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "consumer_loyalty_accounts_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "consumer_loyalty_txns" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"type" text NOT NULL,
	"points" integer NOT NULL,
	"description" text,
	"reference_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consumer_notification_prefs" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"push_enabled" boolean DEFAULT true NOT NULL,
	"in_app_enabled" boolean DEFAULT true NOT NULL,
	"email_enabled" boolean DEFAULT true NOT NULL,
	"sms_enabled" boolean DEFAULT false NOT NULL,
	"push_payments" boolean DEFAULT true NOT NULL,
	"push_fraud" boolean DEFAULT true NOT NULL,
	"push_promotions" boolean DEFAULT false NOT NULL,
	"push_system" boolean DEFAULT true NOT NULL,
	"push_disputes" boolean DEFAULT true NOT NULL,
	"push_loans" boolean DEFAULT true NOT NULL,
	"in_app_payments" boolean DEFAULT true NOT NULL,
	"in_app_fraud" boolean DEFAULT true NOT NULL,
	"in_app_promotions" boolean DEFAULT true NOT NULL,
	"in_app_system" boolean DEFAULT true NOT NULL,
	"in_app_disputes" boolean DEFAULT true NOT NULL,
	"in_app_loans" boolean DEFAULT true NOT NULL,
	"email_payments" boolean DEFAULT true NOT NULL,
	"email_fraud" boolean DEFAULT true NOT NULL,
	"email_promotions" boolean DEFAULT false NOT NULL,
	"email_system" boolean DEFAULT true NOT NULL,
	"email_disputes" boolean DEFAULT true NOT NULL,
	"email_loans" boolean DEFAULT false NOT NULL,
	"quiet_hours_enabled" boolean DEFAULT false NOT NULL,
	"quiet_hours_start" text DEFAULT '22:00' NOT NULL,
	"quiet_hours_end" text DEFAULT '07:00' NOT NULL,
	"digest_frequency" text DEFAULT 'weekly' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "consumer_notification_prefs_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "consumer_outbox" (
	"id" text PRIMARY KEY NOT NULL,
	"aggregate_id" text NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"processed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consumer_phone_verifications" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"phone" text NOT NULL,
	"otp_hash" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consumer_pins" (
	"user_id" integer PRIMARY KEY NOT NULL,
	"pin_hash" text NOT NULL,
	"failed_attempts" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consumer_recurring_payments" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"type" text NOT NULL,
	"biller_code" text,
	"customer_reference" text,
	"recipient_account_number" text,
	"recipient_bank_code" text,
	"recipient_name" text,
	"amount_kobo" bigint NOT NULL,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"frequency" text NOT NULL,
	"next_run_at" timestamp NOT NULL,
	"last_run_at" timestamp,
	"run_count" integer DEFAULT 0 NOT NULL,
	"max_runs" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"label" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consumer_savings_goals" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"target_kobo" integer NOT NULL,
	"saved_kobo" integer DEFAULT 0 NOT NULL,
	"auto_save_enabled" boolean DEFAULT false NOT NULL,
	"auto_save_amount_kobo" integer DEFAULT 0 NOT NULL,
	"auto_save_frequency" text DEFAULT 'monthly' NOT NULL,
	"target_date" timestamp,
	"status" text DEFAULT 'active' NOT NULL,
	"emoji" text DEFAULT '🎯',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "consumer_split_participants" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"user_id" integer,
	"name" text NOT NULL,
	"share_amount_kobo" bigint NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"paid_at" timestamp,
	"wallet_txn_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consumer_split_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"creator_id" integer NOT NULL,
	"title" text NOT NULL,
	"total_amount_kobo" bigint NOT NULL,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consumer_wallet_txns" (
	"id" text PRIMARY KEY NOT NULL,
	"wallet_id" text NOT NULL,
	"user_id" integer NOT NULL,
	"type" text NOT NULL,
	"amount_kobo" bigint NOT NULL,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"balance_after_kobo" bigint NOT NULL,
	"description" text,
	"reference" text,
	"counterparty_name" text,
	"counterparty_account" text,
	"status" text DEFAULT 'completed' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consumer_wallets" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"balance_kobo" bigint DEFAULT 0 NOT NULL,
	"ledger_account_id" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "corridor_live_stats" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"source_currency" text NOT NULL,
	"destination_currency" text NOT NULL,
	"source_country" text NOT NULL,
	"destination_country" text NOT NULL,
	"tx_count" integer DEFAULT 0 NOT NULL,
	"volume_kobo" bigint DEFAULT 0 NOT NULL,
	"avg_fx_rate" real,
	"last_updated" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cost_centres" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"domain" text,
	"budget_amount" double precision,
	"spent_amount" double precision DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "coupon_redemptions" (
	"id" text PRIMARY KEY NOT NULL,
	"coupon_id" text NOT NULL,
	"user_id" integer NOT NULL,
	"amount_saved_kobo" bigint NOT NULL,
	"reference_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coupons" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"type" text NOT NULL,
	"value" integer NOT NULL,
	"min_amount_kobo" bigint DEFAULT 0 NOT NULL,
	"max_discount_kobo" bigint,
	"usage_limit" integer,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"per_user_limit" integer DEFAULT 1 NOT NULL,
	"valid_from" timestamp NOT NULL,
	"valid_until" timestamp NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "coupons_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "cross_border_transfers" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"merchant_id" text,
	"wallet_id" integer,
	"transfer_id" text NOT NULL,
	"quote_id" text,
	"source_currency" text NOT NULL,
	"target_currency" text NOT NULL,
	"source_amount" text NOT NULL,
	"target_amount" text NOT NULL,
	"exchange_rate" text NOT NULL,
	"fee" text DEFAULT '0' NOT NULL,
	"corridor" text NOT NULL,
	"rail" text DEFAULT 'mojaloop' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"sender_name" text,
	"sender_account" text,
	"receiver_name" text,
	"receiver_account" text,
	"receiver_fsp_id" text,
	"error_code" text,
	"error_description" text,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "xborder_tenant_transfer_uniq" UNIQUE("tenant_id","transfer_id")
);
--> statement-breakpoint
CREATE TABLE "crypto_offramp_v2_transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"crypto_asset" text DEFAULT 'USDT' NOT NULL,
	"crypto_amount" text DEFAULT '0' NOT NULL,
	"fiat_currency" text DEFAULT 'NGN' NOT NULL,
	"fiat_amount" integer DEFAULT 0 NOT NULL,
	"exchange_rate" text DEFAULT '0' NOT NULL,
	"bank_code" text,
	"account_number" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"tx_hash" text,
	"wallet_address" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"merchant_id" text NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"phone" text,
	"risk_level" "risk_level" DEFAULT 'low' NOT NULL,
	"plan_id" text DEFAULT 'starter' NOT NULL,
	"total_transactions" integer DEFAULT 0 NOT NULL,
	"total_spend" bigint DEFAULT 0 NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "customers_tenant_merchant_email_uniq" UNIQUE("tenant_id","merchant_id","email")
);
--> statement-breakpoint
CREATE TABLE "dapr_pubsub_events" (
	"id" text PRIMARY KEY NOT NULL,
	"pubsub_component" text DEFAULT 'pubsub' NOT NULL,
	"topic" text NOT NULL,
	"event_type" text NOT NULL,
	"data_content_type" text DEFAULT 'application/json' NOT NULL,
	"data" text,
	"trace_id" text,
	"status" text DEFAULT 'PUBLISHED' NOT NULL,
	"published_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "dapr_state_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"store_component" text DEFAULT 'statestore' NOT NULL,
	"state_key" text NOT NULL,
	"etag" text,
	"value" text,
	"ttl_seconds" integer,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "dcc_transactions" (
	"conversion_id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"from_currency" text NOT NULL,
	"to_currency" text NOT NULL,
	"original_amount_kobo" bigint NOT NULL,
	"converted_amount_kobo" bigint NOT NULL,
	"mid_rate" text NOT NULL,
	"customer_rate" text NOT NULL,
	"margin_pct" text NOT NULL,
	"transfer_id" text,
	"status" text DEFAULT 'pending',
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "developer_api_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"name" text NOT NULL,
	"key_prefix" text NOT NULL,
	"key_hash" text NOT NULL,
	"environment" text DEFAULT 'test' NOT NULL,
	"scopes" text DEFAULT '[]' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_used_at" timestamp,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "developer_webhook_deliveries" (
	"id" text PRIMARY KEY NOT NULL,
	"webhook_id" text NOT NULL,
	"merchant_id" text NOT NULL,
	"event_type" text NOT NULL,
	"event_id" text,
	"payload" text NOT NULL,
	"response_status" integer,
	"response_body" text,
	"duration_ms" integer,
	"attempt" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"next_retry_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "developer_webhooks" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"url" text NOT NULL,
	"description" text,
	"events" text DEFAULT '[]' NOT NULL,
	"signing_secret" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"retry_policy" text DEFAULT 'exponential' NOT NULL,
	"max_retries" integer DEFAULT 3 NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "device_push_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"merchant_id" varchar(64) NOT NULL,
	"user_id" integer NOT NULL,
	"token" text NOT NULL,
	"platform" varchar(8) DEFAULT 'fcm' NOT NULL,
	"device_id" varchar(128),
	"app_version" varchar(32),
	"is_active" boolean DEFAULT true NOT NULL,
	"web_push_endpoint" text,
	"web_push_p256dh" text,
	"web_push_auth" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dfsp_fee_tiers" (
	"id" text PRIMARY KEY NOT NULL,
	"dfsp_id" text NOT NULL,
	"fee_type" text NOT NULL,
	"tier_model" text DEFAULT 'flat' NOT NULL,
	"flat_rate_bps" integer,
	"min_fee_kobo" integer,
	"max_fee_kobo" integer,
	"tier_bands" text,
	"volume_discount_bands" text,
	"effective_from" timestamp DEFAULT now() NOT NULL,
	"effective_to" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dfsp_ndc_limits" (
	"id" text PRIMARY KEY NOT NULL,
	"dfsp_id" text NOT NULL,
	"dfsp_name" text NOT NULL,
	"ndc_limit_kobo" integer DEFAULT 0 NOT NULL,
	"alert_threshold_pct" real DEFAULT 80 NOT NULL,
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "dfsp_ndc_limits_dfsp_id_unique" UNIQUE("dfsp_id")
);
--> statement-breakpoint
CREATE TABLE "dfsp_onboarding_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"dfsp_id" text,
	"institution_name" text NOT NULL,
	"institution_type" text NOT NULL,
	"cbn_license_number" text,
	"cbn_license_doc_url" text,
	"contact_email" text NOT NULL,
	"contact_phone" text,
	"technical_contact_email" text,
	"fspop_endpoint" text,
	"tls_cert_url" text,
	"jwks_url" text,
	"settlement_account_number" text,
	"settlement_bank_code" text,
	"current_step" integer DEFAULT 1 NOT NULL,
	"total_steps" integer DEFAULT 6 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"submitted_at" timestamp,
	"approved_at" timestamp,
	"rejected_at" timestamp,
	"rejection_reason" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "digital_gold_holdings" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"gold_grams" text DEFAULT '0' NOT NULL,
	"purchased_grams" text DEFAULT '0' NOT NULL,
	"avg_purchase_price_per_gram" bigint DEFAULT 0,
	"current_price_per_gram" bigint DEFAULT 0,
	"current_value_kobo" bigint DEFAULT 0,
	"unrealized_pnl_kobo" bigint DEFAULT 0,
	"last_updated" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "digital_gold_transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"type" text NOT NULL,
	"gold_grams" text NOT NULL,
	"amount_kobo" bigint NOT NULL,
	"price_per_gram" bigint NOT NULL,
	"status" text DEFAULT 'completed',
	"reference" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "digital_gold_transactions_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE "disputes" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"merchant_id" text NOT NULL,
	"transaction_id" text,
	"reference" text NOT NULL,
	"amount" bigint NOT NULL,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"status" "dispute_status" DEFAULT 'open' NOT NULL,
	"reason" text,
	"merchant_response" text,
	"evidence" jsonb,
	"due_date" timestamp,
	"resolved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "disputes_tenant_ref_uniq" UNIQUE("tenant_id","reference")
);
--> statement-breakpoint
CREATE TABLE "domain_health_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"domain" text NOT NULL,
	"tps" double precision DEFAULT 0 NOT NULL,
	"error_rate" double precision DEFAULT 0 NOT NULL,
	"p50_latency_ms" integer DEFAULT 0 NOT NULL,
	"p95_latency_ms" integer DEFAULT 0 NOT NULL,
	"p99_latency_ms" integer DEFAULT 0 NOT NULL,
	"uptime" double precision DEFAULT 100 NOT NULL,
	"active_connections" integer DEFAULT 0 NOT NULL,
	"queue_depth" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'healthy' NOT NULL,
	"snapshot_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "emi_contracts" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"customer_id" text,
	"order_id" text NOT NULL,
	"plan_id" text NOT NULL,
	"tenure" integer NOT NULL,
	"principal_kobo" bigint NOT NULL,
	"interest_rate" text DEFAULT '0',
	"processing_fee_kobo" bigint DEFAULT 0,
	"total_amount_kobo" bigint NOT NULL,
	"monthly_installment_kobo" bigint NOT NULL,
	"paid_installments" integer DEFAULT 0,
	"status" text DEFAULT 'active',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "emi_installments" (
	"id" text PRIMARY KEY NOT NULL,
	"emi_contract_id" text NOT NULL,
	"installment_no" integer NOT NULL,
	"due_date" timestamp NOT NULL,
	"amount_kobo" bigint NOT NULL,
	"paid_amount_kobo" bigint DEFAULT 0,
	"status" text DEFAULT 'pending',
	"paid_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "emi_loans" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"principal_kobo" bigint NOT NULL,
	"emi_kobo" bigint NOT NULL,
	"tenure_months" integer NOT NULL,
	"annual_rate_pct" integer DEFAULT 24 NOT NULL,
	"purpose" text NOT NULL,
	"status" text DEFAULT 'pending_approval',
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "emi_repayments" (
	"id" text PRIMARY KEY NOT NULL,
	"loan_id" text NOT NULL,
	"user_id" integer NOT NULL,
	"instalment_number" integer NOT NULL,
	"amount_kobo" bigint NOT NULL,
	"payment_reference" text NOT NULL,
	"status" text DEFAULT 'completed',
	"paid_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "energy_vend_transactions" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"meter_number" varchar(32) NOT NULL,
	"disco" varchar(16) NOT NULL,
	"amount" double precision NOT NULL,
	"currency" varchar(8) DEFAULT 'NGN' NOT NULL,
	"customer_phone" varchar(32) NOT NULL,
	"customer_fsp" varchar(64) NOT NULL,
	"customer_account" varchar(64) NOT NULL,
	"token" varchar(24),
	"units" double precision,
	"transfer_ref" varchar(128),
	"disco_ref" varchar(128),
	"status" varchar(32) DEFAULT 'INITIATED' NOT NULL,
	"error_code" varchar(64),
	"created_by" varchar(64),
	"created_at" timestamp DEFAULT now(),
	"vended_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "escrow_contracts" (
	"escrow_id" text PRIMARY KEY NOT NULL,
	"buyer_merchant_id" text NOT NULL,
	"seller_merchant_id" text NOT NULL,
	"amount_kobo" bigint NOT NULL,
	"currency" text DEFAULT 'NGN',
	"conditions" jsonb,
	"status" text DEFAULT 'funded',
	"released_at" timestamp,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "escrow_contracts_v2" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"buyer_id" text,
	"seller_id" text,
	"title" text NOT NULL,
	"description" text,
	"amount" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"release_conditions" text,
	"dispute_reason" text,
	"milestones" text,
	"expires_at" timestamp,
	"released_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "esignet_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" varchar(64) NOT NULL,
	"client_id" varchar(128) NOT NULL,
	"state" varchar(128) NOT NULL,
	"nonce" varchar(128) NOT NULL,
	"redirect_uri" text NOT NULL,
	"scope" text,
	"acr_values" text,
	"authorization_url" text,
	"auth_code" varchar(256),
	"access_token" text,
	"id_token" text,
	"token_expires_at" timestamp,
	"status" varchar(32) DEFAULT 'INITIATED' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "esignet_sessions_state_unique" UNIQUE("state")
);
--> statement-breakpoint
CREATE TABLE "face_active_liveness_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" varchar(64) NOT NULL,
	"challenge_type" text NOT NULL,
	"nonce" varchar(128) NOT NULL,
	"tenant_id" varchar(64),
	"passed" boolean,
	"confidence" real,
	"frames_analyzed" integer,
	"failure_reason" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"verified_at" timestamp with time zone,
	CONSTRAINT "face_active_liveness_sessions_session_id_unique" UNIQUE("session_id")
);
--> statement-breakpoint
CREATE TABLE "face_attribute_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"request_id" varchar(64) NOT NULL,
	"tenant_id" varchar(64),
	"partner_id" varchar(64),
	"age_estimate" real,
	"age_bracket" text,
	"gender" text,
	"gender_confidence" real,
	"emotion" text,
	"pose_yaw" real,
	"pose_pitch" real,
	"pose_roll" real,
	"occlusion_regions" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "face_attribute_logs_request_id_unique" UNIQUE("request_id")
);
--> statement-breakpoint
CREATE TABLE "face_batch_identify_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"partner_id" text,
	"tenant_id" text,
	"total_probes" integer NOT NULL,
	"identified_count" integer NOT NULL,
	"processing_ms" real,
	"request_id" text,
	"ip_address" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "face_bias_audit_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"snapshot_id" varchar(64) NOT NULL,
	"generated_at" timestamp with time zone NOT NULL,
	"window_secs" integer NOT NULL,
	"total_operations" bigint NOT NULL,
	"groups" jsonb NOT NULL,
	"alerts" jsonb NOT NULL,
	"summary" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "face_bias_audit_snapshots_snapshot_id_unique" UNIQUE("snapshot_id")
);
--> statement-breakpoint
CREATE TABLE "face_biometric_public_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"algorithm" text DEFAULT 'RS256' NOT NULL,
	"public_key" text NOT NULL,
	"fingerprint" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"fetched_at" timestamp DEFAULT now(),
	"expires_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "face_capture_guidance_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"subject_id" varchar(128) NOT NULL,
	"partner_id" varchar(64),
	"ready" boolean NOT NULL,
	"primary_issue" varchar(64),
	"instructions" text,
	"quality_score" varchar(16),
	"context" varchar(32) DEFAULT 'enrollment' NOT NULL,
	"processing_ms" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "face_deepfake_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"request_id" varchar(64) NOT NULL,
	"tenant_id" varchar(64),
	"partner_id" varchar(64),
	"is_deepfake" boolean NOT NULL,
	"deepfake_score" real NOT NULL,
	"attack_type" text,
	"dct_artifact_score" real,
	"consistency_score" real,
	"confidence" real NOT NULL,
	"context" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "face_deepfake_logs_request_id_unique" UNIQUE("request_id")
);
--> statement-breakpoint
CREATE TABLE "face_enrollments" (
	"id" serial PRIMARY KEY NOT NULL,
	"subject_id" varchar(128) NOT NULL,
	"tenant_id" varchar(64),
	"embedding_dim" integer DEFAULT 512 NOT NULL,
	"liveness_passed" boolean,
	"quality_passed" boolean,
	"enrolled_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"revoked_at" timestamp,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "face_enrollments_subject_id_unique" UNIQUE("subject_id")
);
--> statement-breakpoint
CREATE TABLE "face_fidelity_audit_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"subject_id" varchar(128) NOT NULL,
	"tenant_id" varchar(64) DEFAULT 'default' NOT NULL,
	"partner_id" varchar(64),
	"overall_score" varchar(16) NOT NULL,
	"enrollment_ready" boolean NOT NULL,
	"icao_compliant" boolean NOT NULL,
	"remediation_applied" boolean DEFAULT false NOT NULL,
	"rejection_reason" text,
	"guidance_priority" varchar(64),
	"pose_yaw" varchar(16),
	"pose_pitch" varchar(16),
	"pose_roll" varchar(16),
	"sharpness_score" varchar(16),
	"brightness_score" varchar(16),
	"face_width" integer,
	"face_height" integer,
	"context" varchar(32) DEFAULT 'enrollment' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "face_identify_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" varchar(64),
	"identified" boolean NOT NULL,
	"top_match_id" varchar(128),
	"top_similarity" real DEFAULT 0 NOT NULL,
	"candidate_count" integer DEFAULT 0 NOT NULL,
	"probe_liveness" boolean,
	"processing_ms" real,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "face_liveness_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"subject_id" varchar(128),
	"tenant_id" varchar(64),
	"is_live" boolean NOT NULL,
	"spoof_score" real NOT NULL,
	"liveness_score" real NOT NULL,
	"attack_type" varchar(64),
	"face_detected" boolean DEFAULT false NOT NULL,
	"image_hash" varchar(64),
	"processing_ms" real,
	"cached" boolean DEFAULT false NOT NULL,
	"checked_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "face_partner_api_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"partner_id" text NOT NULL,
	"name" text NOT NULL,
	"key_prefix" text NOT NULL,
	"key_hash" text NOT NULL,
	"scopes" text DEFAULT '["face:verify","face:liveness"]' NOT NULL,
	"rate_limit_rpm" integer DEFAULT 60 NOT NULL,
	"environment" text DEFAULT 'production' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_used_at" timestamp,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "face_partner_api_keys_key_hash_unique" UNIQUE("key_hash")
);
--> statement-breakpoint
CREATE TABLE "face_partner_usage_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"key_id" text NOT NULL,
	"partner_id" text NOT NULL,
	"endpoint" text NOT NULL,
	"status_code" integer NOT NULL,
	"latency_ms" integer,
	"request_id" text,
	"ip_address" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "face_partners" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"org_type" text DEFAULT 'commercial' NOT NULL,
	"contact_email" text NOT NULL,
	"website" text,
	"status" text DEFAULT 'active' NOT NULL,
	"allowed_scopes" text DEFAULT '["face:verify","face:liveness","face:quality"]' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "face_payment_assertions" (
	"id" text PRIMARY KEY NOT NULL,
	"subject_id" text NOT NULL,
	"tenant_id" text,
	"partner_id" text,
	"jwt_token" text NOT NULL,
	"similarity" real NOT NULL,
	"liveness_passed" boolean,
	"quality_passed" boolean,
	"issued_at" timestamp DEFAULT now(),
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp,
	"revoked" boolean DEFAULT false NOT NULL,
	"revoked_reason" text,
	"ip_address" text,
	"request_id" text
);
--> statement-breakpoint
CREATE TABLE "face_verify_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"subject_id" varchar(128),
	"tenant_id" varchar(64),
	"verified" boolean NOT NULL,
	"similarity" real NOT NULL,
	"distance" real NOT NULL,
	"threshold" real NOT NULL,
	"liveness_passed" boolean,
	"liveness_score" real,
	"quality_passed" boolean,
	"quality_score" real,
	"face_count_probe" integer DEFAULT 0 NOT NULL,
	"face_count_ref" integer DEFAULT 0 NOT NULL,
	"image_hash_probe" varchar(64),
	"processing_ms" real,
	"cached" boolean DEFAULT false NOT NULL,
	"verified_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "face_video_verify_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"request_id" varchar(64) NOT NULL,
	"subject_id" varchar(64),
	"tenant_id" varchar(64),
	"partner_id" varchar(64),
	"verified" boolean NOT NULL,
	"mean_similarity" real NOT NULL,
	"min_similarity" real,
	"max_similarity" real,
	"frames_analyzed" integer NOT NULL,
	"frames_passed" integer NOT NULL,
	"temporal_consistency" real,
	"liveness_passed" boolean,
	"processing_ms" real,
	"context" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "face_video_verify_logs_request_id_unique" UNIQUE("request_id")
);
--> statement-breakpoint
CREATE TABLE "feature_flags" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"enabled" boolean DEFAULT false NOT NULL,
	"rollout_percentage" integer DEFAULT 0 NOT NULL,
	"target_merchant_ids" text,
	"target_user_ids" text,
	"environment" text DEFAULT 'production' NOT NULL,
	"category" text DEFAULT 'feature' NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp,
	"targeting_rules" jsonb,
	"tenant_id" text,
	CONSTRAINT "feature_flags_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "fee_postings" (
	"id" text PRIMARY KEY NOT NULL,
	"transfer_id" text NOT NULL,
	"window_id" text,
	"dfsp_id" text NOT NULL,
	"fee_type" text NOT NULL,
	"fee_category" text DEFAULT 'DEBIT' NOT NULL,
	"amount_kobo" bigint NOT NULL,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"tigerbeetle_transfer_id" text,
	"billed_at" timestamp,
	"invoice_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fluvio_stream_events" (
	"id" text PRIMARY KEY NOT NULL,
	"topic" text NOT NULL,
	"partition_key" text,
	"payload" text NOT NULL,
	"offset" integer,
	"status" text DEFAULT 'PUBLISHED' NOT NULL,
	"published_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "fluvio_topics" (
	"id" text PRIMARY KEY NOT NULL,
	"topic_name" text NOT NULL,
	"partitions" integer DEFAULT 1 NOT NULL,
	"retention_hours" integer DEFAULT 24 NOT NULL,
	"description" text,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "fluvio_topics_topic_name_unique" UNIQUE("topic_name")
);
--> statement-breakpoint
CREATE TABLE "fraud_alert_comments" (
	"id" text PRIMARY KEY NOT NULL,
	"alert_id" text NOT NULL,
	"merchant_id" text NOT NULL,
	"author_name" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fraud_alerts" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"merchant_id" text NOT NULL,
	"transaction_id" text,
	"customer_id" text,
	"alert_type" "fraud_alert_type" NOT NULL,
	"risk_score" integer DEFAULT 0 NOT NULL,
	"status" "fraud_alert_status" DEFAULT 'open' NOT NULL,
	"description" text,
	"metadata" jsonb,
	"resolved_at" timestamp,
	"resolved_by" text,
	"notes" text,
	"fraud_ring_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fraud_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"condition_tree" text DEFAULT '{}' NOT NULL,
	"actions" text DEFAULT '[]' NOT NULL,
	"priority" integer DEFAULT 100 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"hit_count" integer DEFAULT 0 NOT NULL,
	"last_hit_at" timestamp,
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fx_alerts" (
	"id" serial PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"pair" text NOT NULL,
	"direction" text NOT NULL,
	"threshold" real NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"last_triggered_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fx_rates" (
	"id" serial PRIMARY KEY NOT NULL,
	"base_currency" text DEFAULT 'NGN' NOT NULL,
	"target_currency" text NOT NULL,
	"rate" text NOT NULL,
	"source" text DEFAULT 'exchangerate-api' NOT NULL,
	"fetched_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "g2p_disbursement_batches" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"program_type" varchar(32) NOT NULL,
	"program_id" varchar(64) NOT NULL,
	"payer_fsp" varchar(64) NOT NULL,
	"payer_account" varchar(64) NOT NULL,
	"amount" double precision NOT NULL,
	"currency" varchar(8) DEFAULT 'NGN' NOT NULL,
	"total_amount" double precision NOT NULL,
	"beneficiary_count" integer NOT NULL,
	"disbursed_count" integer DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"status" varchar(32) DEFAULT 'PENDING' NOT NULL,
	"scheduled_at" timestamp,
	"started_at" timestamp,
	"completed_at" timestamp,
	"created_by" varchar(64),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "g2p_identity_verifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" varchar(64) NOT NULL,
	"beneficiary_id" varchar(64) NOT NULL,
	"disbursement_id" varchar(64),
	"individual_id" varchar(64) NOT NULL,
	"individual_id_type" varchar(16) NOT NULL,
	"transaction_id" varchar(64) NOT NULL,
	"program_id" varchar(64),
	"verified" boolean DEFAULT false NOT NULL,
	"kyc_data" jsonb,
	"verified_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "g2p_identity_verifications_transaction_id_unique" UNIQUE("transaction_id")
);
--> statement-breakpoint
CREATE TABLE "geofence_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"terminal_id" text,
	"name" text NOT NULL,
	"center_lat" integer NOT NULL,
	"center_lng" integer NOT NULL,
	"radius_meters" integer DEFAULT 500 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gnn_training_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"model_type" "ai_model_type" DEFAULT 'gnn_fraud' NOT NULL,
	"status" "gnn_job_status" DEFAULT 'queued' NOT NULL,
	"epochs" integer DEFAULT 50 NOT NULL,
	"hidden_dims" integer DEFAULT 256 NOT NULL,
	"learning_rate" real DEFAULT 0.001 NOT NULL,
	"batch_size" integer DEFAULT 256 NOT NULL,
	"current_epoch" integer DEFAULT 0 NOT NULL,
	"train_loss" real,
	"val_loss" real,
	"best_accuracy" real,
	"dataset_size" integer,
	"artifact_path" text,
	"error_message" text,
	"triggered_by" text,
	"started_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gold_sip_plans" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"amount_kobo" bigint NOT NULL,
	"frequency" text NOT NULL,
	"status" text DEFAULT 'active',
	"next_run_at" timestamp,
	"total_invested_kobo" bigint DEFAULT 0,
	"total_gold_grams" text DEFAULT '0',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "healthcare_claims" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"policy_number" varchar(64) NOT NULL,
	"beneficiary_id" varchar(64) NOT NULL,
	"beneficiary_name" varchar(128) NOT NULL,
	"provider_id" varchar(64) NOT NULL,
	"provider_name" varchar(128) NOT NULL,
	"claim_type" varchar(32) NOT NULL,
	"diagnosis_codes" text DEFAULT '[]' NOT NULL,
	"procedure_codes" text DEFAULT '[]' NOT NULL,
	"claim_amount" double precision NOT NULL,
	"approved_amount" double precision,
	"currency" varchar(8) DEFAULT 'NGN' NOT NULL,
	"service_date" varchar(16) NOT NULL,
	"status" varchar(32) DEFAULT 'SUBMITTED' NOT NULL,
	"nhia_claim_ref" varchar(128),
	"adjudication_notes" text,
	"submitted_by" varchar(64),
	"submitted_at" timestamp DEFAULT now(),
	"adjudicated_at" timestamp,
	"paid_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "help_search_analytics" (
	"id" text PRIMARY KEY NOT NULL,
	"query" text NOT NULL,
	"user_type" text DEFAULT 'merchant' NOT NULL,
	"user_id" text,
	"result_count" integer DEFAULT 0 NOT NULL,
	"clicked_section" text,
	"session_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "idempotency_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"merchant_id" text NOT NULL,
	"operation" text NOT NULL,
	"request_hash" text NOT NULL,
	"response_status" integer NOT NULL,
	"response_body" jsonb,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "insurance_policies" (
	"policy_id" text PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"merchant_id" text,
	"product_id" text NOT NULL,
	"product_name" text NOT NULL,
	"provider" text NOT NULL,
	"premium_kobo" bigint NOT NULL,
	"coverage_type" text NOT NULL,
	"status" text DEFAULT 'active',
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "insurance_premium_payments" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"policy_id" varchar(64) NOT NULL,
	"policy_number" varchar(64) NOT NULL,
	"amount" double precision NOT NULL,
	"currency" varchar(8) DEFAULT 'NGN' NOT NULL,
	"due_date" varchar(16) NOT NULL,
	"paid_at" timestamp,
	"transfer_ref" varchar(128),
	"status" varchar(32) DEFAULT 'PENDING' NOT NULL,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "intl_remittance_transfers" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"corridor_id" text NOT NULL,
	"send_amount_usd" text NOT NULL,
	"receive_amount" text NOT NULL,
	"receive_currency" text NOT NULL,
	"exchange_rate" text NOT NULL,
	"fee_usd" text NOT NULL,
	"recipient_name" text NOT NULL,
	"recipient_account_number" text NOT NULL,
	"recipient_bank_code" text NOT NULL,
	"recipient_country" text NOT NULL,
	"purpose" text,
	"tracking_number" text,
	"status" text DEFAULT 'processing',
	"provider" text,
	"estimated_delivery" timestamp,
	"delivered_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "intl_remittance_transfers_tracking_number_unique" UNIQUE("tracking_number")
);
--> statement-breakpoint
CREATE TABLE "inventory_audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"item_id" text NOT NULL,
	"merchant_id" text NOT NULL,
	"delta" bigint NOT NULL,
	"reason" text NOT NULL,
	"reference_id" text,
	"previous_stock" bigint NOT NULL,
	"new_stock" bigint NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_items" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"name" text NOT NULL,
	"unit" text DEFAULT 'unit' NOT NULL,
	"current_stock" integer DEFAULT 0 NOT NULL,
	"reorder_level" integer DEFAULT 10 NOT NULL,
	"cost_per_unit" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_reservations" (
	"reservation_id" text PRIMARY KEY NOT NULL,
	"item_id" text NOT NULL,
	"merchant_id" text NOT NULL,
	"quantity" bigint NOT NULL,
	"order_id" text,
	"status" text DEFAULT 'active' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"released_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"item_id" text NOT NULL,
	"type" text NOT NULL,
	"quantity" integer NOT NULL,
	"order_id" text,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invite_codes" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"type" "invite_code_type" DEFAULT 'merchant' NOT NULL,
	"uses_remaining" integer DEFAULT 1 NOT NULL,
	"uses_total" integer DEFAULT 1 NOT NULL,
	"expires_at" timestamp,
	"created_by" text NOT NULL,
	"tenant_id" text,
	"metadata" text,
	"is_revoked" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "invite_codes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "invoice_financing_v2_applications" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"invoice_id" text,
	"invoice_amount" integer DEFAULT 0 NOT NULL,
	"requested_amount" integer DEFAULT 0 NOT NULL,
	"approved_amount" integer,
	"interest_rate" text DEFAULT '3.5' NOT NULL,
	"tenor_days" integer DEFAULT 30 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"disbursed_at" timestamp,
	"repaid_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_payments" (
	"id" text PRIMARY KEY NOT NULL,
	"invoice_id" text NOT NULL,
	"amount_kobo" bigint NOT NULL,
	"method" text,
	"reference" text,
	"paid_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"invoice_id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"customer_id" text,
	"customer_email" text,
	"customer_name" text,
	"line_items" jsonb NOT NULL,
	"subtotal_kobo" bigint NOT NULL,
	"tax_kobo" bigint DEFAULT 0,
	"total_kobo" bigint NOT NULL,
	"currency" text DEFAULT 'NGN',
	"status" text DEFAULT 'draft',
	"due_date" text,
	"paid_at" timestamp,
	"payment_link_url" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jws_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"dfsp_id" text NOT NULL,
	"algorithm" text DEFAULT 'PS256' NOT NULL,
	"key_type" text DEFAULT 'RSA' NOT NULL,
	"public_key_pem" text NOT NULL,
	"private_key_pem" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"expires_at" timestamp,
	"revoked_at" timestamp,
	"revoked_by" text
);
--> statement-breakpoint
CREATE TABLE "kds_stations" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"name" text NOT NULL,
	"categories" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "keycloak_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"realm_id" text,
	"client_id" text,
	"user_id" text,
	"session_id" text,
	"ip_address" text,
	"geo_country" text,
	"geo_city" text,
	"geo_anomaly_acknowledged" boolean DEFAULT false,
	"error" text,
	"details" jsonb,
	"received_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "keycloak_provisioning_log" (
	"id" text PRIMARY KEY NOT NULL,
	"keycloak_user_id" text,
	"username" text NOT NULL,
	"email" text,
	"realm" text DEFAULT 'nexthub' NOT NULL,
	"roles" text[] DEFAULT '{}' NOT NULL,
	"linked_entity_type" text,
	"linked_entity_id" text,
	"operation" text DEFAULT 'CREATE' NOT NULL,
	"status" text DEFAULT 'SUCCESS' NOT NULL,
	"error_message" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "kyb_documents" (
	"id" text PRIMARY KEY NOT NULL,
	"verification_id" text NOT NULL,
	"merchant_id" text NOT NULL,
	"document_type" text NOT NULL,
	"file_name" text NOT NULL,
	"file_key" text NOT NULL,
	"file_url" text NOT NULL,
	"mime_type" text NOT NULL,
	"file_size_bytes" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"review_notes" text,
	"reviewed_by" text,
	"reviewed_at" timestamp,
	"uploaded_by" text NOT NULL,
	"uploaded_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kyb_risk_scores" (
	"id" text PRIMARY KEY NOT NULL,
	"verification_id" text NOT NULL,
	"merchant_id" text NOT NULL,
	"composite_score" real NOT NULL,
	"risk_band" text NOT NULL,
	"ubo_risk_score" real,
	"adverse_media_score" real,
	"geo_velocity_score" real,
	"document_quality_score" real,
	"liveness_score" real,
	"bvn_match_score" real,
	"scored_at" timestamp DEFAULT now() NOT NULL,
	"scored_by" text DEFAULT 'auto',
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kyb_steps" (
	"id" text PRIMARY KEY NOT NULL,
	"verification_id" text NOT NULL,
	"step_name" text NOT NULL,
	"status" text DEFAULT 'pending',
	"notes" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kyb_verifications" (
	"verification_id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"business_name" text NOT NULL,
	"rc_number" text,
	"tax_id" text,
	"business_type" text,
	"industry_code" text,
	"status" text DEFAULT 'pending',
	"risk_level" text,
	"initiated_by" text,
	"started_at" timestamp,
	"expires_at" timestamp,
	"renewal_reminder_sent_at" timestamp,
	"last_known_ip" text,
	"last_known_country" text,
	"geo_velocity_flagged" boolean DEFAULT false,
	"geo_velocity_note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kyc_submissions" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"merchant_id" text NOT NULL,
	"customer_id" text,
	"doc_type" "kyc_doc_type" NOT NULL,
	"status" "kyc_status" DEFAULT 'pending' NOT NULL,
	"document_url" text,
	"selfie_url" text,
	"rejection_reason" text,
	"reviewed_by" text,
	"reviewed_at" timestamp,
	"expires_at" timestamp,
	"liveness_score" real,
	"liveness_mode" text,
	"liveness_challenge_type" text,
	"liveness_passed_at" timestamp,
	"liveness_session_id" text,
	"liveness_override" boolean,
	"liveness_override_note" text,
	"liveness_override_by" text,
	"liveness_override_at" timestamp,
	"ocr_extracted_data" jsonb,
	"ocr_confidence" real,
	"ocr_processed_at" timestamp,
	"bvn_number" text,
	"bvn_match_score" real,
	"bvn_verified_at" timestamp,
	"bvn_verification_status" text,
	"document_expiry_date" timestamp,
	"document_expired" boolean DEFAULT false,
	"liveness_retry_count" integer DEFAULT 0 NOT NULL,
	"liveness_blocked_until" timestamp,
	"face_match_verified" boolean,
	"face_match_score" real,
	"face_match_distance" real,
	"face_match_model" text,
	"face_match_at" timestamp,
	"estimated_age" integer,
	"age_estimation_flag" text,
	"face_embedding" jsonb,
	"duplicate_check_at" timestamp,
	"duplicate_flag" boolean DEFAULT false,
	"duplicate_of_submission_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lakehouse_sync_queue" (
	"id" text PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"source_table" text NOT NULL,
	"source_id" text NOT NULL,
	"payload" text NOT NULL,
	"retries" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"synced_at" timestamp,
	"error_message" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "liquidity_alerts" (
	"id" text PRIMARY KEY NOT NULL,
	"dfsp_id" text NOT NULL,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"position_kobo" integer NOT NULL,
	"ndc_limit_kobo" integer NOT NULL,
	"utilisation_pct" real NOT NULL,
	"alert_level" text NOT NULL,
	"resolved_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "liveness_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"submission_id" text,
	"session_ref" text,
	"mode" text DEFAULT 'passive' NOT NULL,
	"challenge_type" text,
	"decision" "liveness_decision",
	"liveness_score" real,
	"confidence_score" real,
	"spoof_type" text,
	"rust_signal_score" real,
	"go_gateway_score" real,
	"python_ml_score" real,
	"ensemble_weights" jsonb,
	"frame_count" integer DEFAULT 0 NOT NULL,
	"passive_frame_url" text,
	"challenge_frame_urls" jsonb,
	"override_decision" "liveness_decision",
	"override_note" text,
	"override_by" text,
	"override_at" timestamp,
	"ip_address" text,
	"user_agent" text,
	"device_type" text,
	"duration_ms" integer,
	"retention_expires_at" timestamp,
	"ndpr_purged_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "loan_instalments" (
	"id" text PRIMARY KEY NOT NULL,
	"loan_id" text NOT NULL,
	"merchant_id" text NOT NULL,
	"due_date" text NOT NULL,
	"amount_kobo" bigint NOT NULL,
	"paid_kobo" bigint DEFAULT 0,
	"status" text DEFAULT 'pending',
	"paid_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "loan_repayments" (
	"id" text PRIMARY KEY NOT NULL,
	"loan_id" text NOT NULL,
	"merchant_id" text NOT NULL,
	"amount_kobo" bigint NOT NULL,
	"transfer_id" text,
	"method" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "loyalty_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text,
	"program_id" text DEFAULT 'default',
	"merchant_id" text NOT NULL,
	"customer_id" integer,
	"points_balance" bigint DEFAULT 0 NOT NULL,
	"lifetime_points" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "loyalty_accounts_account_id_unique" UNIQUE("account_id")
);
--> statement-breakpoint
CREATE TABLE "loyalty_ledger" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"entry_type" text NOT NULL,
	"points" bigint NOT NULL,
	"balance_after" bigint NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"reference_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "loyalty_programs" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"points_per_kobo" integer DEFAULT 1 NOT NULL,
	"redeem_rate" integer DEFAULT 100 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "loyalty_programs_merchant_id_unique" UNIQUE("merchant_id")
);
--> statement-breakpoint
CREATE TABLE "loyalty_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"type" text NOT NULL,
	"points" bigint NOT NULL,
	"order_id" text,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "loyalty_v3_members" (
	"id" text PRIMARY KEY NOT NULL,
	"program_id" text NOT NULL,
	"merchant_id" text NOT NULL,
	"customer_id" text NOT NULL,
	"customer_email" text NOT NULL,
	"points_balance" integer DEFAULT 0 NOT NULL,
	"lifetime_points" integer DEFAULT 0 NOT NULL,
	"tier" text DEFAULT 'bronze' NOT NULL,
	"joined_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "loyalty_v3_programs" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"program_name" text NOT NULL,
	"points_per_naira" integer DEFAULT 1 NOT NULL,
	"redemption_rate" integer DEFAULT 100 NOT NULL,
	"expiry_days" integer DEFAULT 365 NOT NULL,
	"tiers" text DEFAULT '[]' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"total_members" integer DEFAULT 0 NOT NULL,
	"total_points_issued" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "loyalty_v3_redemptions" (
	"id" text PRIMARY KEY NOT NULL,
	"program_id" text NOT NULL,
	"member_id" text NOT NULL,
	"merchant_id" text NOT NULL,
	"customer_id" text NOT NULL,
	"reward_tier" text NOT NULL,
	"points_redeemed" integer NOT NULL,
	"points_balance_before" integer NOT NULL,
	"points_balance_after" integer NOT NULL,
	"naira_value" integer DEFAULT 0 NOT NULL,
	"redemption_code" text NOT NULL,
	"pin_verified" boolean DEFAULT false NOT NULL,
	"kafka_event_id" text,
	"kafka_event_status" text DEFAULT 'pending' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"confirmed_at" timestamp,
	"fulfilled_at" timestamp,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "loyalty_v3_redemptions_redemption_code_unique" UNIQUE("redemption_code")
);
--> statement-breakpoint
CREATE TABLE "marketplace_orders" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"buyer_email" text NOT NULL,
	"seller_merchant_id" text,
	"items" text DEFAULT '[]' NOT NULL,
	"subtotal" integer DEFAULT 0 NOT NULL,
	"platform_fee" integer DEFAULT 0 NOT NULL,
	"total_amount" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"payment_method" text DEFAULT 'card',
	"escrow_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "menu_categories" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"name" text NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "menu_items" (
	"id" text PRIMARY KEY NOT NULL,
	"category_id" text NOT NULL,
	"merchant_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"price_kobo" bigint NOT NULL,
	"available" boolean DEFAULT true NOT NULL,
	"image_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchant_directors" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"full_name" text NOT NULL,
	"bvn" text,
	"nin" text,
	"date_of_birth" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchant_loans" (
	"loan_id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"status" text DEFAULT 'pending_review',
	"requested_kobo" bigint NOT NULL,
	"approved_kobo" bigint DEFAULT 0,
	"amount_kobo" bigint DEFAULT 0,
	"outstanding_kobo" bigint DEFAULT 0,
	"credit_score" integer DEFAULT 0,
	"risk_band" text,
	"rate_annual_pct" text DEFAULT '0',
	"term_days" integer DEFAULT 90,
	"purpose_code" text,
	"notes" text,
	"due_date" text,
	"disbursed_at" timestamp,
	"transfer_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchant_notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"merchant_id" varchar(64) NOT NULL,
	"type" varchar(64) NOT NULL,
	"title" varchar(255) NOT NULL,
	"body" text NOT NULL,
	"entity_id" varchar(64),
	"entity_type" varchar(32),
	"is_read" boolean DEFAULT false NOT NULL,
	"priority" varchar(16) DEFAULT 'medium' NOT NULL,
	"action_url" varchar(512),
	"metadata" text,
	"dismissed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchant_profiles" (
	"merchant_id" text PRIMARY KEY NOT NULL,
	"business_name" text NOT NULL,
	"rc_number" text,
	"tax_id" text,
	"address" text,
	"state" text,
	"country" text DEFAULT 'NG',
	"kyc_status" text DEFAULT 'pending',
	"kyb_status" text DEFAULT 'pending',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchant_risk_scores" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"overall_score" integer DEFAULT 0 NOT NULL,
	"fraud_score" integer DEFAULT 0 NOT NULL,
	"chargeback_score" integer DEFAULT 0 NOT NULL,
	"kyc_score" integer DEFAULT 0 NOT NULL,
	"transaction_score" integer DEFAULT 0 NOT NULL,
	"velocity_score" integer DEFAULT 0 NOT NULL,
	"risk_level" text DEFAULT 'low' NOT NULL,
	"factors" text,
	"recommendation" text,
	"reviewed_by" text,
	"reviewed_at" timestamp,
	"calculated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchant_solana_wallets" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"wallet_address" text NOT NULL,
	"label" text DEFAULT 'default',
	"network" text DEFAULT 'mainnet' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"verified_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchant_status_log" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"action" text NOT NULL,
	"reason" text NOT NULL,
	"notes" text,
	"performed_by" text NOT NULL,
	"previous_status" text,
	"new_status" text,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchants" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"owner_id" integer NOT NULL,
	"business_name" text NOT NULL,
	"business_type" text,
	"email" text,
	"phone" text,
	"country" text DEFAULT 'NG' NOT NULL,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"status" "merchant_status" DEFAULT 'pending' NOT NULL,
	"is_live" boolean DEFAULT false NOT NULL,
	"onboarding_step" integer DEFAULT 0 NOT NULL,
	"webhook_url" text,
	"logo_url" text,
	"notify_on_fraud_alert" boolean DEFAULT true NOT NULL,
	"notify_on_payout" boolean DEFAULT true NOT NULL,
	"notify_on_dispute" boolean DEFAULT true NOT NULL,
	"payout_approval_threshold" bigint DEFAULT 500000 NOT NULL,
	"payout_approval_enabled" boolean DEFAULT false NOT NULL,
	"settlement_frequency" "settlement_freq" DEFAULT 'daily' NOT NULL,
	"settlement_min_amount" bigint DEFAULT 10000 NOT NULL,
	"settlement_bank_code" text,
	"settlement_account_number" text,
	"settlement_account_name" text,
	"merchant_code" text,
	"ussd_pin" text,
	"soundbox_language" text DEFAULT 'en' NOT NULL,
	"ussd_lang_picker_enabled" boolean DEFAULT true NOT NULL,
	"recon_alert_badge_enabled" boolean DEFAULT true NOT NULL,
	"recon_alert_threshold" integer DEFAULT 1 NOT NULL,
	"min_liveness_score" real DEFAULT 0.7 NOT NULL,
	"kyb_required" boolean DEFAULT true NOT NULL,
	"kyc_auto_approve_threshold" real DEFAULT 0.95 NOT NULL,
	"aml_screening_enabled" boolean DEFAULT true NOT NULL,
	"sanctions_check_enabled" boolean DEFAULT true NOT NULL,
	"pep_check_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "merchants_merchant_code_unique" UNIQUE("merchant_code")
);
--> statement-breakpoint
CREATE TABLE "mobile_money_recon" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"merchant_id" text NOT NULL,
	"transaction_id" text,
	"provider" text NOT NULL,
	"provider_ref" text NOT NULL,
	"amount" bigint NOT NULL,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"status" "mm_recon_status" DEFAULT 'pending' NOT NULL,
	"reconciled_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "money_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"requester_id" integer NOT NULL,
	"amount_kobo" bigint NOT NULL,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"note" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"payer_user_id" integer,
	"payer_name" text,
	"paid_at" timestamp,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mosip_credential_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" varchar(64) NOT NULL,
	"request_id" varchar(128) NOT NULL,
	"credential_type" varchar(32) DEFAULT 'pdf' NOT NULL,
	"issuer" varchar(128),
	"recepient_id" varchar(64) NOT NULL,
	"recepient_id_type" varchar(8) DEFAULT 'UIN' NOT NULL,
	"status" varchar(32) DEFAULT 'REQUESTED' NOT NULL,
	"status_comment" text,
	"data_share_url" text,
	"requested_at" timestamp DEFAULT now() NOT NULL,
	"issued_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "mosip_credential_requests_request_id_unique" UNIQUE("request_id")
);
--> statement-breakpoint
CREATE TABLE "mosip_ekyc_submissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" varchar(64) NOT NULL,
	"individual_id" varchar(64) NOT NULL,
	"individual_id_type" varchar(16) NOT NULL,
	"transaction_id" varchar(64) NOT NULL,
	"consent_obtained" boolean DEFAULT false NOT NULL,
	"requested_attributes" text[] NOT NULL,
	"kyc_data" jsonb,
	"status" varchar(32) DEFAULT 'PENDING' NOT NULL,
	"error_code" varchar(32),
	"partner_id" varchar(64),
	"response_time" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "mosip_ekyc_submissions_transaction_id_unique" UNIQUE("transaction_id")
);
--> statement-breakpoint
CREATE TABLE "mosip_otp_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" varchar(64) NOT NULL,
	"individual_id" varchar(64) NOT NULL,
	"individual_id_type" varchar(16) NOT NULL,
	"transaction_id" varchar(64) NOT NULL,
	"otp_channel" text[] NOT NULL,
	"masked_email" varchar(64),
	"masked_mobile" varchar(32),
	"status" varchar(32) DEFAULT 'OTP_SENT' NOT NULL,
	"error_code" varchar(32),
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "mosip_otp_log_transaction_id_unique" UNIQUE("transaction_id")
);
--> statement-breakpoint
CREATE TABLE "mosip_registration_packets" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" varchar(64) NOT NULL,
	"registration_id" varchar(64) NOT NULL,
	"packet_id" varchar(128) NOT NULL,
	"packet_name" varchar(256) NOT NULL,
	"source" varchar(64) DEFAULT 'NEXTHUB' NOT NULL,
	"process" varchar(16) DEFAULT 'NEW' NOT NULL,
	"schema_version" varchar(16),
	"status_code" varchar(64) DEFAULT 'RECEIVED' NOT NULL,
	"status_comment" text,
	"uploaded_at" timestamp DEFAULT now() NOT NULL,
	"processed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "mosip_registration_packets_registration_id_unique" UNIQUE("registration_id")
);
--> statement-breakpoint
CREATE TABLE "mosip_registrations" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" varchar(64) NOT NULL,
	"pre_registration_id" varchar(64) NOT NULL,
	"created_by" varchar(128) NOT NULL,
	"lang_code" varchar(8) DEFAULT 'eng' NOT NULL,
	"status_code" varchar(32) DEFAULT 'PENDING_APPOINTMENT' NOT NULL,
	"full_name" varchar(256),
	"date_of_birth" varchar(16),
	"gender" varchar(32),
	"email" varchar(256),
	"phone" varchar(32),
	"postal_code" varchar(16),
	"appointment_date" varchar(16),
	"center_id" varchar(64),
	"registration_id" varchar(64),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "mosip_registrations_pre_registration_id_unique" UNIQUE("pre_registration_id")
);
--> statement-breakpoint
CREATE TABLE "mosip_uin_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" varchar(64) NOT NULL,
	"uin_hash" varchar(128) NOT NULL,
	"registration_id" varchar(64),
	"status" varchar(32) DEFAULT 'ACTIVATED' NOT NULL,
	"full_name" varchar(256),
	"date_of_birth" varchar(16),
	"gender" varchar(32),
	"locked_auth_types" jsonb,
	"issued_at" timestamp,
	"last_updated_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "mosip_uin_records_uin_hash_unique" UNIQUE("uin_hash")
);
--> statement-breakpoint
CREATE TABLE "mosip_vid_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" varchar(64) NOT NULL,
	"vid_hash" varchar(128) NOT NULL,
	"uin_hash" varchar(128) NOT NULL,
	"vid_type" varchar(16) DEFAULT 'PERPETUAL' NOT NULL,
	"status" varchar(16) DEFAULT 'ACTIVE' NOT NULL,
	"expiry_time" timestamp,
	"generated_on" timestamp DEFAULT now() NOT NULL,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "mosip_vid_records_vid_hash_unique" UNIQUE("vid_hash")
);
--> statement-breakpoint
CREATE TABLE "mtls_certificates" (
	"id" text PRIMARY KEY NOT NULL,
	"dfsp_id" text NOT NULL,
	"cert_type" text NOT NULL,
	"common_name" text NOT NULL,
	"certificate_pem" text NOT NULL,
	"private_key_pem" text,
	"serial_number" text,
	"issued_at" timestamp NOT NULL,
	"expires_at" timestamp NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"revoked_at" timestamp,
	"revocation_reason" text
);
--> statement-breakpoint
CREATE TABLE "multi_currency_ledger_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"currency" text NOT NULL,
	"balance" integer DEFAULT 0 NOT NULL,
	"available_balance" integer DEFAULT 0 NOT NULL,
	"reserved_balance" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "multi_currency_ledger_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"account_id" text NOT NULL,
	"type" text DEFAULT 'credit' NOT NULL,
	"amount" integer DEFAULT 0 NOT NULL,
	"currency" text NOT NULL,
	"description" text,
	"reference" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mutual_fund_holdings" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"fund_id" text NOT NULL,
	"fund_name" text NOT NULL,
	"units" text DEFAULT '0' NOT NULL,
	"avg_nav_at_purchase" text DEFAULT '0' NOT NULL,
	"current_nav" text DEFAULT '0',
	"invested_amount_kobo" bigint DEFAULT 0,
	"current_value_kobo" bigint DEFAULT 0,
	"unrealized_pnl_kobo" bigint DEFAULT 0,
	"last_updated" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mutual_fund_transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"fund_id" text NOT NULL,
	"type" text NOT NULL,
	"amount_kobo" bigint NOT NULL,
	"units" text NOT NULL,
	"nav_at_transaction" text NOT NULL,
	"status" text DEFAULT 'completed',
	"reference" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "mutual_fund_transactions_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE "ndc_breach_events" (
	"id" text PRIMARY KEY NOT NULL,
	"dfsp_id" text NOT NULL,
	"dfsp_name" text NOT NULL,
	"current_position_kobo" integer NOT NULL,
	"ndc_limit_kobo" integer NOT NULL,
	"breach_percentage" real NOT NULL,
	"severity" text,
	"window_id" text,
	"resolved_at" timestamp,
	"resolution" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "network_quality_events" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"device_id" text,
	"network_type" text NOT NULL,
	"bandwidth_kbps" integer,
	"latency_ms" integer,
	"packet_loss_pct" real,
	"ws_connected" boolean DEFAULT true NOT NULL,
	"ws_fallback_active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nexthub_beneficiary_registry" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"full_name" text NOT NULL,
	"nin" text,
	"bvn" text,
	"phone" text,
	"email" text,
	"bank_account" text,
	"bank_code" text,
	"domains" text DEFAULT '[]' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "nexthub_bulk_transfers" (
	"id" serial PRIMARY KEY NOT NULL,
	"bulk_transfer_id" varchar(64) NOT NULL,
	"bulk_quote_id" varchar(64),
	"payer_fsp" varchar(64) NOT NULL,
	"payee_fsp" varchar(64) NOT NULL,
	"state" varchar(32) DEFAULT 'RECEIVED' NOT NULL,
	"total_transfers" integer DEFAULT 0 NOT NULL,
	"completed_transfers" integer DEFAULT 0 NOT NULL,
	"failed_transfers" integer DEFAULT 0 NOT NULL,
	"expiration" timestamp,
	"completed_at" timestamp,
	"error_code" varchar(8),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "nexthub_bulk_transfers_bulk_transfer_id_unique" UNIQUE("bulk_transfer_id")
);
--> statement-breakpoint
CREATE TABLE "nexthub_dfsps" (
	"id" text PRIMARY KEY NOT NULL,
	"dfsp_id" text NOT NULL,
	"dfsp_name" text NOT NULL,
	"dfsp_type" text DEFAULT 'bank' NOT NULL,
	"country" text DEFAULT 'NG' NOT NULL,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"tigerbeetle_position_account_id" text,
	"tigerbeetle_liquidity_account_id" text,
	"liquidity_limit_kobo" bigint DEFAULT 0 NOT NULL,
	"callback_url" text,
	"client_certificate_thumbprint" text,
	"certificate_expires_at" timestamp,
	"onboarded_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "nexthub_dfsps_dfsp_id_unique" UNIQUE("dfsp_id")
);
--> statement-breakpoint
CREATE TABLE "nexthub_domain_quotas" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"domain" text NOT NULL,
	"daily_limit" integer DEFAULT 10000 NOT NULL,
	"monthly_limit" integer DEFAULT 250000 NOT NULL,
	"current_daily" integer DEFAULT 0 NOT NULL,
	"current_monthly" integer DEFAULT 0 NOT NULL,
	"rate_limit_rpm" integer DEFAULT 120 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"reset_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "nexthub_fx_rates" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_currency" varchar(8) NOT NULL,
	"target_currency" varchar(8) NOT NULL,
	"rate" varchar(32) NOT NULL,
	"provider" varchar(64) DEFAULT 'nexthub-fx' NOT NULL,
	"valid_from" timestamp NOT NULL,
	"valid_to" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "nexthub_invoices" (
	"id" text PRIMARY KEY NOT NULL,
	"dfsp_id" text NOT NULL,
	"dfsp_name" text NOT NULL,
	"billing_period_start" timestamp NOT NULL,
	"billing_period_end" timestamp NOT NULL,
	"total_scheme_fees_kobo" bigint DEFAULT 0 NOT NULL,
	"total_interchange_kobo" bigint DEFAULT 0 NOT NULL,
	"total_fx_markup_kobo" bigint DEFAULT 0 NOT NULL,
	"total_penalties_kobo" bigint DEFAULT 0 NOT NULL,
	"total_amount_kobo" bigint DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"pdf_url" text,
	"tigerbeetle_invoice_transfer_id" text,
	"issued_at" timestamp,
	"due_at" timestamp,
	"paid_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nexthub_liquidity_windows" (
	"window_id" text PRIMARY KEY NOT NULL,
	"participant_id" text NOT NULL,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"amount" bigint NOT NULL,
	"opened_at" timestamp DEFAULT now(),
	"closes_at" timestamp NOT NULL,
	"status" text DEFAULT 'OPEN' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nexthub_oracles" (
	"id" serial PRIMARY KEY NOT NULL,
	"oracle_id" varchar(64) NOT NULL,
	"name" varchar(128) NOT NULL,
	"party_id_type" varchar(32) NOT NULL,
	"currency" varchar(8),
	"endpoint" varchar(512) NOT NULL,
	"is_default" integer DEFAULT 0 NOT NULL,
	"is_active" integer DEFAULT 1 NOT NULL,
	"health_status" varchar(16) DEFAULT 'UNKNOWN' NOT NULL,
	"last_health_check" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "nexthub_oracles_oracle_id_unique" UNIQUE("oracle_id")
);
--> statement-breakpoint
CREATE TABLE "nexthub_participant_limits" (
	"id" text PRIMARY KEY NOT NULL,
	"participant_id" text NOT NULL,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"net_debit_cap" bigint NOT NULL,
	"liquidity_cover" bigint DEFAULT 0 NOT NULL,
	"position_limit" bigint,
	"alert_threshold" double precision DEFAULT 0.8 NOT NULL,
	"suspend_on_breach" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp DEFAULT now(),
	"updated_by" text
);
--> statement-breakpoint
CREATE TABLE "nexthub_participant_positions" (
	"id" text PRIMARY KEY NOT NULL,
	"participant_id" text NOT NULL,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"current_value" bigint DEFAULT 0 NOT NULL,
	"reserved_value" bigint DEFAULT 0 NOT NULL,
	"available_value" bigint DEFAULT 0 NOT NULL,
	"ndc_utilisation" double precision DEFAULT 0 NOT NULL,
	"position_status" text DEFAULT 'OK' NOT NULL,
	"last_transfer_id" text,
	"last_updated" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "nexthub_participants" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"dfsp_id" text NOT NULL,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"scheme_type" text DEFAULT 'FSPIOP' NOT NULL,
	"endpoint_url" text NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "nexthub_participants_dfsp_id_unique" UNIQUE("dfsp_id")
);
--> statement-breakpoint
CREATE TABLE "nexthub_pisp_consents" (
	"id" serial PRIMARY KEY NOT NULL,
	"consent_id" varchar(64) NOT NULL,
	"consent_request_id" varchar(64),
	"consumer_id" varchar(64) DEFAULT '' NOT NULL,
	"pisp_id" varchar(64) NOT NULL,
	"dfsp_id" varchar(64) NOT NULL,
	"state" varchar(32) DEFAULT 'REQUESTED' NOT NULL,
	"scopes" text DEFAULT '[]' NOT NULL,
	"auth_channels" text DEFAULT '[]',
	"credential" text,
	"expires_at" timestamp,
	"revoked_at" timestamp,
	"revoke_reason" varchar(128),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "nexthub_pisp_consents_consent_id_unique" UNIQUE("consent_id")
);
--> statement-breakpoint
CREATE TABLE "nexthub_regulators" (
	"id" text PRIMARY KEY NOT NULL,
	"regulator_code" text NOT NULL,
	"regulator_name" text NOT NULL,
	"jurisdiction" text DEFAULT 'NG' NOT NULL,
	"regulatory_type" text DEFAULT 'central_bank' NOT NULL,
	"contact_email" text,
	"reporting_frequency" text DEFAULT 'daily' NOT NULL,
	"data_access_level" text DEFAULT 'aggregate' NOT NULL,
	"api_endpoint" text,
	"webhook_url" text,
	"status" text DEFAULT 'active' NOT NULL,
	"onboarded_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "nexthub_regulators_regulator_code_unique" UNIQUE("regulator_code")
);
--> statement-breakpoint
CREATE TABLE "nexthub_security_events" (
	"id" text PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"severity" text DEFAULT 'MEDIUM' NOT NULL,
	"dfsp_id" text,
	"source_ip" text,
	"description" text NOT NULL,
	"metadata" text,
	"acknowledged" boolean DEFAULT false NOT NULL,
	"acknowledged_by" text,
	"acknowledged_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nexthub_transfers" (
	"id" text PRIMARY KEY NOT NULL,
	"payer_fsp_id" text NOT NULL,
	"payee_fsp_id" text NOT NULL,
	"payer_party_id" text NOT NULL,
	"payee_party_id" text NOT NULL,
	"amount_kobo" bigint NOT NULL,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"state" text DEFAULT 'RECEIVED' NOT NULL,
	"ilp_packet" text,
	"condition" text,
	"fulfilment" text,
	"fraud_score" real,
	"scheme_fee_kobo" bigint DEFAULT 0,
	"interchange_fee_kobo" bigint DEFAULT 0,
	"fx_rate" real,
	"tigerbeetle_transfer_id" text,
	"tigerbeetle_fee_id" text,
	"window_id" text,
	"expiration_time" timestamp,
	"error_code" text,
	"error_description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nfc_devices" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"device_id" text NOT NULL,
	"device_name" text NOT NULL,
	"device_type" text DEFAULT 'android' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"last_seen" timestamp,
	"total_transactions" integer DEFAULT 0 NOT NULL,
	"total_volume" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "nfc_devices_device_id_unique" UNIQUE("device_id")
);
--> statement-breakpoint
CREATE TABLE "nfc_transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"device_id" text NOT NULL,
	"amount" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"card_scheme" text DEFAULT 'mastercard' NOT NULL,
	"masked_pan" text,
	"status" text DEFAULT 'approved' NOT NULL,
	"response_code" text DEFAULT '00',
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nft_badges" (
	"badge_id" text PRIMARY KEY NOT NULL,
	"recipient_id" text NOT NULL,
	"recipient_type" text DEFAULT 'merchant',
	"badge_type" text NOT NULL,
	"badge_name" text NOT NULL,
	"metadata" jsonb,
	"mint_tx_hash" text,
	"network" text DEFAULT 'solana',
	"status" text DEFAULT 'minting',
	"minted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ninauth_consent_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"state" text NOT NULL,
	"code_verifier" text NOT NULL,
	"nonce" text,
	"scopes" text[] DEFAULT '{}' NOT NULL,
	"redirect_uri" text,
	"user_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	CONSTRAINT "ninauth_consent_sessions_state_unique" UNIQUE("state")
);
--> statement-breakpoint
CREATE TABLE "ninauth_verified_identities" (
	"id" text PRIMARY KEY NOT NULL,
	"nin_hash" text NOT NULL,
	"first_name" text,
	"last_name" text,
	"middle_name" text,
	"date_of_birth" text,
	"gender" text,
	"phone_hash" text,
	"email_hash" text,
	"state_of_origin" text,
	"lga" text,
	"verified_at" timestamp with time zone DEFAULT now() NOT NULL,
	"access_token" text,
	"id_token" text,
	"token_expires_at" timestamp with time zone,
	"user_id" text,
	"session_id" text
);
--> statement-breakpoint
CREATE TABLE "nin_face_match_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"nin_prefix" text NOT NULL,
	"verified" boolean NOT NULL,
	"similarity" real NOT NULL,
	"liveness_passed" boolean NOT NULL,
	"liveness_score" real NOT NULL,
	"match_type" text NOT NULL,
	"context" text NOT NULL,
	"assertion_jwt_id" text,
	"partner_id" text,
	"user_id" text,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nin_vc_verification_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"vc_id" text NOT NULL,
	"issuer" text,
	"subject_nin_hash" text,
	"valid" boolean NOT NULL,
	"claims" jsonb,
	"partner_id" text,
	"error" text,
	"verified_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nin_verification_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"nin_prefix" text NOT NULL,
	"verified" boolean NOT NULL,
	"match_type" text,
	"field_results" jsonb,
	"operator_id" text,
	"partner_id" text,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nip_account_cache" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"bank_code" text NOT NULL,
	"account_number" text NOT NULL,
	"account_name" text NOT NULL,
	"session_id" text,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nip_banks" (
	"id" text PRIMARY KEY NOT NULL,
	"bank_code" text NOT NULL,
	"bank_name" text NOT NULL,
	"short_name" text,
	"nip_code" text,
	"category" text DEFAULT 'commercial',
	"is_active" integer DEFAULT 1 NOT NULL,
	"supports_nip" integer DEFAULT 1 NOT NULL,
	"supports_ussd" integer DEFAULT 0 NOT NULL,
	"logo_url" text,
	"last_synced_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "nip_banks_bank_code_unique" UNIQUE("bank_code")
);
--> statement-breakpoint
CREATE TABLE "nip_name_enquiry_cache" (
	"id" serial PRIMARY KEY NOT NULL,
	"bank_nip_code" text NOT NULL,
	"account_number" text NOT NULL,
	"account_name" text NOT NULL,
	"bank_verification_number" text,
	"kyc_level" text,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nip_resolution_errors" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" varchar(64) NOT NULL,
	"merchant_id" varchar(64) NOT NULL,
	"bank_code" varchar(10) NOT NULL,
	"account_number" varchar(10) NOT NULL,
	"attempt_number" integer DEFAULT 1 NOT NULL,
	"error_code" varchar(50),
	"error_message" text,
	"error_source" varchar(50) DEFAULT 'nibss',
	"resolved_at" timestamp,
	"resolved_account_name" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nip_virtual_accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"payment_link_id" text,
	"checkout_session_id" text,
	"bank_nip_code" text NOT NULL,
	"bank_name" text NOT NULL,
	"account_number" text NOT NULL,
	"account_name" text NOT NULL,
	"amount_expected" integer,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"reference" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"paid_at" timestamp,
	"paid_amount" integer,
	"nibss_reference" text,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "nip_virtual_accounts_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE "nodal_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"account_number" text,
	"bank_name" text NOT NULL,
	"bank_code" text NOT NULL,
	"purpose" text NOT NULL,
	"description" text,
	"balance_kobo" bigint DEFAULT 0,
	"status" text DEFAULT 'active',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "nodal_accounts_account_number_unique" UNIQUE("account_number")
);
--> statement-breakpoint
CREATE TABLE "nodal_transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"nodal_account_id" text NOT NULL,
	"merchant_id" text NOT NULL,
	"type" text NOT NULL,
	"amount_kobo" bigint NOT NULL,
	"narration" text,
	"counterparty_name" text,
	"counterparty_account" text,
	"counterparty_bank" text,
	"reference" text,
	"status" text DEFAULT 'completed',
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "nodal_transactions_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE "offline_queue" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"operation_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "offline_queue_status" DEFAULT 'pending' NOT NULL,
	"priority" "offline_queue_priority" DEFAULT 'normal' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"next_retry_at" timestamp,
	"last_error" text,
	"synced_at" timestamp,
	"device_id" text,
	"network_type" text,
	"bandwidth_kbps" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "open_banking_accounts_v2" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"consent_id" text NOT NULL,
	"bank_code" text NOT NULL,
	"account_number" text NOT NULL,
	"account_type" text DEFAULT 'current' NOT NULL,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"balance" integer DEFAULT 0 NOT NULL,
	"last_sync_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "open_banking_consents_v2" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"bank_code" text NOT NULL,
	"bank_name" text NOT NULL,
	"scopes" text DEFAULT 'accounts' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"consent_token" text,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "openappsec_alerts" (
	"id" text PRIMARY KEY NOT NULL,
	"alert_id" text NOT NULL,
	"policy_id" text,
	"severity" text DEFAULT 'medium' NOT NULL,
	"attack_type" text NOT NULL,
	"source_ip" text,
	"target_uri" text,
	"request_id" text,
	"payload" text,
	"action" text DEFAULT 'blocked' NOT NULL,
	"resolved_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "openappsec_alerts_alert_id_unique" UNIQUE("alert_id")
);
--> statement-breakpoint
CREATE TABLE "openappsec_policies" (
	"id" text PRIMARY KEY NOT NULL,
	"policy_id" text NOT NULL,
	"name" text NOT NULL,
	"mode" text DEFAULT 'prevent' NOT NULL,
	"asset_urls" text[] DEFAULT '{}' NOT NULL,
	"practice_config" text,
	"trusted_sources" text,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "openappsec_policies_policy_id_unique" UNIQUE("policy_id")
);
--> statement-breakpoint
CREATE TABLE "overhead_costs" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"category" "overhead_cost_category" NOT NULL,
	"amount_kobo" bigint NOT NULL,
	"description" text NOT NULL,
	"period_start" timestamp NOT NULL,
	"period_end" timestamp NOT NULL,
	"recorded_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "p2p_transfers" (
	"id" text PRIMARY KEY NOT NULL,
	"sender_id" integer NOT NULL,
	"sender_wallet_id" text NOT NULL,
	"recipient_account_number" text NOT NULL,
	"recipient_bank_code" text NOT NULL,
	"recipient_bank_name" text,
	"recipient_name" text NOT NULL,
	"amount_kobo" bigint NOT NULL,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"narration" text,
	"nip_session_id" text,
	"nip_ref" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"failure_reason" text,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "partner_onboarding_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"invite_code" text,
	"user_id" text,
	"current_step" "onboarding_step" DEFAULT 'invite_code' NOT NULL,
	"company_name" text,
	"company_email" text,
	"company_phone" text,
	"company_address" text,
	"company_rc_number" text,
	"branding_primary_color" text DEFAULT '#1a56db',
	"branding_secondary_color" text DEFAULT '#7e3af2',
	"branding_logo_url" text,
	"branding_favicon_url" text,
	"branding_font_family" text DEFAULT 'Inter',
	"fee_structure" text,
	"is_completed" boolean DEFAULT false NOT NULL,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_links" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"merchant_id" text NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"amount" bigint,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"usage_limit" integer,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"redirect_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "payment_links_tenant_slug_uniq" UNIQUE("tenant_id","slug")
);
--> statement-breakpoint
CREATE TABLE "payouts" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"merchant_id" text NOT NULL,
	"reference" text NOT NULL,
	"amount" bigint NOT NULL,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"status" "payout_status" DEFAULT 'pending' NOT NULL,
	"bank_code" text,
	"account_number" text,
	"account_name" text,
	"narration" text,
	"fee_amount" bigint DEFAULT 0 NOT NULL,
	"failure_reason" text,
	"processed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "payouts_tenant_ref_uniq" UNIQUE("tenant_id","reference")
);
--> statement-breakpoint
CREATE TABLE "payroll_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"period_start" timestamp NOT NULL,
	"period_end" timestamp NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"total_kobo" bigint DEFAULT 0 NOT NULL,
	"staff_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payroll_v3_employees" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"full_name" text NOT NULL,
	"email" text NOT NULL,
	"department" text DEFAULT 'General' NOT NULL,
	"bank_code" text NOT NULL,
	"account_number" text NOT NULL,
	"gross_salary" integer DEFAULT 0 NOT NULL,
	"tax_pin" text,
	"pension_pin" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payroll_v3_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"run_name" text NOT NULL,
	"period" text NOT NULL,
	"total_employees" integer DEFAULT 0 NOT NULL,
	"total_gross" integer DEFAULT 0 NOT NULL,
	"total_deductions" integer DEFAULT 0 NOT NULL,
	"total_net" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"processed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pension_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"rsa_pin" text,
	"pfa" text DEFAULT 'PayGate PFA' NOT NULL,
	"fund_type" text DEFAULT 'fund_ii',
	"balance_kobo" bigint DEFAULT 0,
	"employer_contribution_kobo" bigint DEFAULT 0,
	"employee_contribution_kobo" bigint DEFAULT 0,
	"status" text DEFAULT 'active',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "pension_accounts_rsa_pin_unique" UNIQUE("rsa_pin")
);
--> statement-breakpoint
CREATE TABLE "pension_contributions" (
	"id" text PRIMARY KEY NOT NULL,
	"pension_account_id" text NOT NULL,
	"merchant_id" text NOT NULL,
	"amount_kobo" bigint NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'processed',
	"reference" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "pension_contributions_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE "permify_permission_checks" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" text NOT NULL,
	"permission" text NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" text NOT NULL,
	"allowed" boolean NOT NULL,
	"reason" text,
	"checked_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "permify_relationships" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"relation" text NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" text NOT NULL,
	"snap_token" text,
	"operation" text DEFAULT 'WRITE' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "pisp_onboarding_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"pisp_id" text,
	"company_name" text NOT NULL,
	"cbn_license_number" text,
	"cbn_license_doc_url" text,
	"contact_email" text NOT NULL,
	"redirect_urls" text,
	"webhook_url" text,
	"consent_scope_requested" text,
	"business_description" text,
	"current_step" integer DEFAULT 1 NOT NULL,
	"total_steps" integer DEFAULT 5 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"submitted_at" timestamp,
	"approved_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "portal_subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"plan" text DEFAULT 'free',
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"status" text DEFAULT 'active',
	"current_period_start" timestamp,
	"current_period_end" timestamp,
	"cancel_at_period_end" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "portal_subscriptions_merchant_id_unique" UNIQUE("merchant_id")
);
--> statement-breakpoint
CREATE TABLE "portfolio_rebalancing_orders" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"asset_type" text NOT NULL,
	"direction" text NOT NULL,
	"amount_kobo" bigint NOT NULL,
	"target_allocation_pct" real NOT NULL,
	"current_allocation_pct" real NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"executed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pos_operator_onboarding_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text,
	"operator_name" text NOT NULL,
	"ptsp_code" text,
	"terminal_count" integer DEFAULT 1 NOT NULL,
	"deployment_locations" text,
	"nibss_approval_doc_url" text,
	"contact_email" text NOT NULL,
	"contact_phone" text,
	"current_step" integer DEFAULT 1 NOT NULL,
	"total_steps" integer DEFAULT 4 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"submitted_at" timestamp,
	"approved_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "pos_products" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"terminal_id" text,
	"sku" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"category" text DEFAULT 'general' NOT NULL,
	"price_kobo" integer NOT NULL,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"tax_percent" integer DEFAULT 0 NOT NULL,
	"stock_quantity" integer,
	"track_inventory" boolean DEFAULT false NOT NULL,
	"image_url" text,
	"barcode" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pos_terminals" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"serial_number" text NOT NULL,
	"model" "pos_terminal_model" DEFAULT 'soundbox_basic' NOT NULL,
	"label" text,
	"location" text,
	"latitude" integer,
	"longitude" integer,
	"status" "pos_terminal_status" DEFAULT 'active' NOT NULL,
	"last_heartbeat_at" timestamp,
	"firmware_version" text,
	"ip_address" text,
	"audio_alerts_enabled" boolean DEFAULT true NOT NULL,
	"audio_language" text DEFAULT 'en' NOT NULL,
	"total_transactions" integer DEFAULT 0 NOT NULL,
	"total_volume_kobo" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "pos_terminals_serial_number_unique" UNIQUE("serial_number")
);
--> statement-breakpoint
CREATE TABLE "pos_transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"terminal_id" text NOT NULL,
	"merchant_id" text NOT NULL,
	"transaction_id" text,
	"amount_kobo" bigint NOT NULL,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"channel" text DEFAULT 'qr' NOT NULL,
	"masked_pan" text,
	"nip_session_id" text,
	"status" text DEFAULT 'completed' NOT NULL,
	"receipt_data" jsonb,
	"settlement_status" text DEFAULT 'pending' NOT NULL,
	"settlement_batch_id" text,
	"nibss_reference" text,
	"settled_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "privacy_aliases" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"alias" text NOT NULL,
	"expires_at" timestamp,
	"status" text DEFAULT 'active',
	"usage_count" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "privacy_aliases_alias_unique" UNIQUE("alias")
);
--> statement-breakpoint
CREATE TABLE "privacy_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"privacy_mode" text DEFAULT 'standard',
	"hide_business_name" integer DEFAULT 0,
	"hide_bank_details" integer DEFAULT 0,
	"use_private_alias" integer DEFAULT 0,
	"private_alias" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "privacy_settings_merchant_id_unique" UNIQUE("merchant_id")
);
--> statement-breakpoint
CREATE TABLE "psp_onboarding_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"psp_id" text,
	"company_name" text NOT NULL,
	"psp_type" text DEFAULT 'acquirer' NOT NULL,
	"cbn_license_number" text,
	"pcidss_level" text,
	"pcidss_doc_url" text,
	"contact_email" text NOT NULL,
	"settlement_bank_code" text,
	"merchant_category_codes_allowed" text,
	"max_transaction_amount" double precision,
	"current_step" integer DEFAULT 1 NOT NULL,
	"total_steps" integer DEFAULT 5 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"submitted_at" timestamp,
	"approved_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ptsp_batches" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"settlement_date" text NOT NULL,
	"status" "ptsp_batch_status" DEFAULT 'pending' NOT NULL,
	"nibss_reference" text,
	"total_amount_kobo" bigint DEFAULT 0 NOT NULL,
	"transaction_count" integer DEFAULT 0 NOT NULL,
	"submitted_at" timestamp,
	"confirmed_at" timestamp,
	"failure_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_orders" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"inventory_item_id" text,
	"item_name" text NOT NULL,
	"vendor_name" text,
	"quantity" integer NOT NULL,
	"unit" text DEFAULT 'unit' NOT NULL,
	"unit_cost_kobo" bigint DEFAULT 0 NOT NULL,
	"total_cost_kobo" bigint DEFAULT 0 NOT NULL,
	"notes" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "qr_payments" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"amount" bigint,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"description" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp,
	"claimed_by" integer,
	"claimed_at" timestamp,
	"transaction_ref" text,
	"metadata" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limit_events" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"identifier_type" text DEFAULT 'user' NOT NULL,
	"procedure" text,
	"endpoint" text,
	"window_ms" integer NOT NULL,
	"limit_val" integer NOT NULL,
	"count" integer NOT NULL,
	"blocked" boolean DEFAULT false NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "realtime_notification_history" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"channel" text DEFAULT 'email' NOT NULL,
	"event_type" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"status" text DEFAULT 'delivered' NOT NULL,
	"delivered_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "realtime_notification_preferences" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"webhook_enabled" integer DEFAULT 1 NOT NULL,
	"email_enabled" integer DEFAULT 1 NOT NULL,
	"sms_enabled" integer DEFAULT 0 NOT NULL,
	"push_enabled" integer DEFAULT 1 NOT NULL,
	"in_app_enabled" integer DEFAULT 1 NOT NULL,
	"event_payment" integer DEFAULT 1 NOT NULL,
	"event_dispute" integer DEFAULT 1 NOT NULL,
	"event_payout" integer DEFAULT 1 NOT NULL,
	"event_fraud" integer DEFAULT 1 NOT NULL,
	"event_kyc" integer DEFAULT 1 NOT NULL,
	"digest_frequency" text DEFAULT 'daily' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "realtime_notification_preferences_merchant_id_unique" UNIQUE("merchant_id")
);
--> statement-breakpoint
CREATE TABLE "recipe_ingredients" (
	"id" serial PRIMARY KEY NOT NULL,
	"menu_item_id" text NOT NULL,
	"inventory_item_id" text NOT NULL,
	"quantity_per_serving" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reconciliation_alerts" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"currency" text NOT NULL,
	"pg_balance" bigint NOT NULL,
	"tb_balance" bigint NOT NULL,
	"delta" bigint NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"resolved_at" timestamp,
	"resolved_by" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reconciliation_exceptions" (
	"id" text PRIMARY KEY NOT NULL,
	"window_id" text NOT NULL,
	"transfer_id" text,
	"dfsp_id" text,
	"break_type" text NOT NULL,
	"severity" text DEFAULT 'MEDIUM' NOT NULL,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"hub_amount_kobo" bigint,
	"rail_amount_kobo" bigint,
	"discrepancy_amount_kobo" bigint,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"description" text,
	"resolution_notes" text,
	"auto_resolve_sla_minutes" integer,
	"resolved_at" timestamp,
	"escalated_at" timestamp,
	"assigned_to" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "red_envelope_claims" (
	"id" text PRIMARY KEY NOT NULL,
	"envelope_id" text NOT NULL,
	"claimant_id" integer NOT NULL,
	"claimant_wallet_id" text NOT NULL,
	"amount_kobo" bigint NOT NULL,
	"claimed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "red_envelopes" (
	"id" text PRIMARY KEY NOT NULL,
	"sender_id" integer NOT NULL,
	"sender_wallet_id" text NOT NULL,
	"total_amount_kobo" bigint NOT NULL,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"slots" integer DEFAULT 5 NOT NULL,
	"claimed_slots" integer DEFAULT 0 NOT NULL,
	"message" text,
	"status" text DEFAULT 'active' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "redis_cache_invalidations" (
	"id" text PRIMARY KEY NOT NULL,
	"namespace" text NOT NULL,
	"cache_key" text NOT NULL,
	"reason" text,
	"invalidated_by" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "referrals" (
	"id" text PRIMARY KEY NOT NULL,
	"referrer_id" integer NOT NULL,
	"referee_id" integer,
	"referral_code" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"referrer_reward_kobo" integer DEFAULT 50000 NOT NULL,
	"referee_reward_kobo" integer DEFAULT 25000 NOT NULL,
	"referrer_paid" boolean DEFAULT false NOT NULL,
	"referee_paid" boolean DEFAULT false NOT NULL,
	"qualification_txn_id" text,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "referrals_referral_code_unique" UNIQUE("referral_code")
);
--> statement-breakpoint
CREATE TABLE "regulator_documents" (
	"id" text PRIMARY KEY NOT NULL,
	"regulator_id" text NOT NULL,
	"document_type" text NOT NULL,
	"filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"s3_key" text NOT NULL,
	"status" text DEFAULT 'pending_upload' NOT NULL,
	"uploaded_at" timestamp,
	"reviewed_at" timestamp,
	"review_note" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "regulator_magic_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"regulator_id" text NOT NULL,
	"email" text NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "regulator_magic_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "regulator_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"regulator_id" text NOT NULL,
	"email" text NOT NULL,
	"session_token" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "regulator_sessions_session_token_unique" UNIQUE("session_token")
);
--> statement-breakpoint
CREATE TABLE "regulatory_reports" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"report_type" text DEFAULT 'CBN_MONTHLY' NOT NULL,
	"period" text NOT NULL,
	"regulator" text DEFAULT 'CBN' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"submitted_at" timestamp,
	"acknowledged_at" timestamp,
	"report_data" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "regulatory_sandbox_configs" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"sandbox_type" text NOT NULL,
	"config" jsonb,
	"is_active" integer DEFAULT 1,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "remittance_corridors" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"from_currency" varchar(8) NOT NULL,
	"to_currency" varchar(8) NOT NULL,
	"from_country" varchar(4) NOT NULL,
	"to_country" varchar(4) NOT NULL,
	"exchange_rate" double precision NOT NULL,
	"fee" double precision DEFAULT 0 NOT NULL,
	"fee_type" varchar(16) DEFAULT 'FLAT' NOT NULL,
	"min_amount" double precision DEFAULT 100 NOT NULL,
	"max_amount" double precision DEFAULT 5000000 NOT NULL,
	"provider" varchar(64) NOT NULL,
	"is_active" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "remittance_transfers" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"corridor_id" varchar(64) NOT NULL,
	"sender_fsp" varchar(64) NOT NULL,
	"sender_account" varchar(64) NOT NULL,
	"receiver_fsp" varchar(64) NOT NULL,
	"receiver_account" varchar(64) NOT NULL,
	"send_amount" double precision NOT NULL,
	"send_currency" varchar(8) NOT NULL,
	"receive_amount" double precision,
	"receive_currency" varchar(8),
	"exchange_rate" double precision,
	"fee" double precision,
	"receiver_name" varchar(128) NOT NULL,
	"narration" varchar(256),
	"status" varchar(32) DEFAULT 'INITIATED' NOT NULL,
	"rail_ref" varchar(128),
	"travel_rule_ref" varchar(128),
	"risk_score" integer,
	"created_by" varchar(64),
	"created_at" timestamp DEFAULT now(),
	"settled_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "report_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"type" text NOT NULL,
	"format" text NOT NULL,
	"from_date" text NOT NULL,
	"to_date" text NOT NULL,
	"filters" jsonb,
	"status" text DEFAULT 'pending',
	"row_count" integer DEFAULT 0,
	"download_url" text,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "restaurant_order_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"name" text NOT NULL,
	"qty" integer DEFAULT 1 NOT NULL,
	"unit_price_kobo" bigint NOT NULL,
	"course_number" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "restaurant_orders" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"table_id" text,
	"status" "restaurant_order_status" DEFAULT 'open' NOT NULL,
	"covers" integer DEFAULT 1 NOT NULL,
	"total_kobo" bigint DEFAULT 0 NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "restaurant_tables" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"table_number" text NOT NULL,
	"capacity" integer DEFAULT 4 NOT NULL,
	"section" text DEFAULT 'main' NOT NULL,
	"status" "restaurant_table_status" DEFAULT 'available' NOT NULL,
	"pos_x" integer DEFAULT 0 NOT NULL,
	"pos_y" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "retail_pos_configs" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"store_name" text NOT NULL,
	"store_address" text,
	"currency" text DEFAULT 'NGN',
	"tax_rate" text DEFAULT '0.075',
	"receipt_footer" text,
	"enable_inventory_alerts" integer DEFAULT 1,
	"low_stock_threshold" integer DEFAULT 10,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "retail_pos_configs_merchant_id_unique" UNIQUE("merchant_id")
);
--> statement-breakpoint
CREATE TABLE "retail_sales" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"customer_id" text,
	"items" jsonb NOT NULL,
	"subtotal_kobo" bigint NOT NULL,
	"tax_kobo" bigint DEFAULT 0,
	"total_kobo" bigint NOT NULL,
	"payment_method" text NOT NULL,
	"receipt_url" text,
	"reference" text,
	"status" text DEFAULT 'completed',
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "retail_sales_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE "retry_policies" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text,
	"operation_type" text NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"initial_delay_ms" integer DEFAULT 1000 NOT NULL,
	"backoff_multiplier" real DEFAULT 2 NOT NULL,
	"max_delay_ms" integer DEFAULT 60000 NOT NULL,
	"retry_on_statuses" jsonb DEFAULT '[500,502,503,504]'::jsonb,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saga_instances" (
	"id" text PRIMARY KEY NOT NULL,
	"saga_type" text NOT NULL,
	"merchant_id" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"current_step" integer DEFAULT 0 NOT NULL,
	"total_steps" integer DEFAULT 5 NOT NULL,
	"steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"started_at" timestamp DEFAULT now(),
	"completed_at" timestamp,
	"duration_ms" integer,
	"error_message" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"workflow_id" text,
	"run_id" text
);
--> statement-breakpoint
CREATE TABLE "salary_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"employee_name" text NOT NULL,
	"employee_email" text NOT NULL,
	"account_number" text,
	"bank_code" text DEFAULT '044',
	"bank_name" text DEFAULT 'Access Bank',
	"salary_kobo" bigint NOT NULL,
	"balance_kobo" bigint DEFAULT 0,
	"advance_used_kobo" bigint DEFAULT 0,
	"max_advance_kobo" bigint DEFAULT 0,
	"status" text DEFAULT 'active',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "salary_accounts_account_number_unique" UNIQUE("account_number")
);
--> statement-breakpoint
CREATE TABLE "salary_transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"salary_account_id" text NOT NULL,
	"merchant_id" text NOT NULL,
	"type" text NOT NULL,
	"amount_kobo" bigint NOT NULL,
	"description" text,
	"reference" text,
	"status" text DEFAULT 'completed',
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "salary_transactions_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE "saved_beneficiaries" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"account_number" text NOT NULL,
	"bank_code" text NOT NULL,
	"bank_name" text NOT NULL,
	"account_name" text NOT NULL,
	"nickname" text,
	"transfer_count" integer DEFAULT 1 NOT NULL,
	"last_used_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scf_invoices" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"token_id" varchar(64) NOT NULL,
	"invoice_number" varchar(64) NOT NULL,
	"supplier_id" varchar(64) NOT NULL,
	"supplier_fsp" varchar(64) NOT NULL,
	"supplier_account" varchar(64) NOT NULL,
	"buyer_id" varchar(64) NOT NULL,
	"buyer_fsp" varchar(64) NOT NULL,
	"buyer_account" varchar(64) NOT NULL,
	"amount" double precision NOT NULL,
	"currency" varchar(8) DEFAULT 'NGN' NOT NULL,
	"due_date" varchar(16) NOT NULL,
	"discount_rate" double precision,
	"discount_amount" double precision,
	"net_amount" double precision,
	"status" varchar(32) DEFAULT 'SUBMITTED' NOT NULL,
	"transfer_ref" varchar(128),
	"created_by" varchar(64),
	"created_at" timestamp DEFAULT now(),
	"paid_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "scheduled_reports" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"type" text NOT NULL,
	"frequency" text NOT NULL,
	"format" text NOT NULL,
	"email" text NOT NULL,
	"status" text DEFAULT 'active',
	"last_run_at" timestamp,
	"next_run_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scuml_checks" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"verification_id" text,
	"entity_name" text NOT NULL,
	"rc_number" text,
	"check_type" text NOT NULL,
	"status" text DEFAULT 'pending',
	"scuml_ref" text,
	"flag_reason" text,
	"checked_at" timestamp,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sdk_tokens" (
	"token_id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"scopes" jsonb,
	"is_revoked" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settlement_banks" (
	"id" text PRIMARY KEY NOT NULL,
	"bank_code" text NOT NULL,
	"bank_name" text NOT NULL,
	"nip_code" text,
	"swift_code" text,
	"cbn_license_number" text,
	"settlement_account_number" text,
	"settlement_account_name" text,
	"contact_email" text,
	"contact_phone" text,
	"status" text DEFAULT 'active' NOT NULL,
	"is_rtgs_enabled" boolean DEFAULT false NOT NULL,
	"is_nip_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "settlement_banks_bank_code_unique" UNIQUE("bank_code")
);
--> statement-breakpoint
CREATE TABLE "settlement_corridors" (
	"id" text PRIMARY KEY NOT NULL,
	"corridor_id" text NOT NULL,
	"source_currency" text NOT NULL,
	"target_currency" text NOT NULL,
	"fx_rate" real DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "settlement_corridors_corridor_id_unique" UNIQUE("corridor_id")
);
--> statement-breakpoint
CREATE TABLE "settlement_net_positions" (
	"id" text PRIMARY KEY NOT NULL,
	"window_id" text NOT NULL,
	"dfsp_id" text NOT NULL,
	"dfsp_name" text NOT NULL,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"net_position_kobo" bigint DEFAULT 0 NOT NULL,
	"total_debits_kobo" bigint DEFAULT 0 NOT NULL,
	"total_credits_kobo" bigint DEFAULT 0 NOT NULL,
	"transfer_count" integer DEFAULT 0 NOT NULL,
	"tigerbeetle_account_id" text,
	"settlement_instruction" text,
	"settled_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settlement_sla_events" (
	"id" text PRIMARY KEY NOT NULL,
	"settlement_id" text NOT NULL,
	"merchant_id" text NOT NULL,
	"amount_kobo" integer NOT NULL,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"expected_by" timestamp NOT NULL,
	"completed_at" timestamp,
	"status" text DEFAULT 'pending' NOT NULL,
	"sla_breached" boolean DEFAULT false NOT NULL,
	"breach_minutes" integer,
	"escalated_at" timestamp,
	"escalation_level" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settlement_windows" (
	"id" text PRIMARY KEY NOT NULL,
	"window_type" text NOT NULL,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"opened_at" timestamp DEFAULT now() NOT NULL,
	"closed_at" timestamp,
	"settled_at" timestamp,
	"total_transfers" integer DEFAULT 0 NOT NULL,
	"total_amount_kobo" bigint DEFAULT 0 NOT NULL,
	"settlement_report_url" text,
	"rail_reference" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settlements" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"merchant_id" text NOT NULL,
	"reference" text NOT NULL,
	"amount" bigint NOT NULL,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"bank_code" text,
	"account_number" text,
	"account_name" text,
	"status" "settlement_status" DEFAULT 'pending' NOT NULL,
	"sla_deadline_at" timestamp,
	"sla_breached_at" timestamp,
	"sla_alert_sent_at" timestamp,
	"workflow_id" text,
	"bridge_ref" text,
	"failure_reason" text,
	"severity" text DEFAULT 'normal',
	"resolved_at" timestamp,
	"notes" text,
	"initiated_at" timestamp DEFAULT now() NOT NULL,
	"processed_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "settlements_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE "soundbox_devices" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"device_id" text NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'online',
	"volume" integer DEFAULT 80,
	"language" text DEFAULT 'en',
	"custom_message" text,
	"last_seen" timestamp DEFAULT now(),
	"total_transactions" integer DEFAULT 0,
	"total_volume_kobo" bigint DEFAULT 0,
	"registered_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "soundbox_devices_device_id_unique" UNIQUE("device_id")
);
--> statement-breakpoint
CREATE TABLE "split_bill_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"merchant_id" text NOT NULL,
	"total_kobo" bigint NOT NULL,
	"split_count" integer NOT NULL,
	"paid_count" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "split_bill_shares" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"share_kobo" bigint NOT NULL,
	"payment_link_id" text,
	"paid_at" timestamp,
	"share_index" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "split_payments" (
	"split_payment_id" text PRIMARY KEY NOT NULL,
	"split_rule_id" text NOT NULL,
	"total_amount_kobo" bigint NOT NULL,
	"reference" text,
	"legs" jsonb NOT NULL,
	"status" text DEFAULT 'completed',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "split_rules" (
	"rule_id" text PRIMARY KEY NOT NULL,
	"rule_name" text NOT NULL,
	"description" text,
	"recipients" jsonb NOT NULL,
	"created_by" text,
	"is_active" integer DEFAULT 1,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_members" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"name" text NOT NULL,
	"role" text DEFAULT 'server' NOT NULL,
	"hourly_rate_kobo" bigint DEFAULT 0 NOT NULL,
	"bank_code" text,
	"account_number" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_shifts" (
	"id" serial PRIMARY KEY NOT NULL,
	"staff_id" text NOT NULL,
	"merchant_id" text NOT NULL,
	"clock_in" timestamp NOT NULL,
	"clock_out" timestamp,
	"tips_kobo" bigint DEFAULT 0 NOT NULL,
	"hours_worked" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stripe_subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"stripe_price_id" text,
	"plan" text DEFAULT 'free' NOT NULL,
	"status" "stripe_sub_status" DEFAULT 'active' NOT NULL,
	"current_period_start" timestamp,
	"current_period_end" timestamp,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"trial_end" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "stripe_subscriptions_stripe_subscription_id_unique" UNIQUE("stripe_subscription_id")
);
--> statement-breakpoint
CREATE TABLE "subscription_charges" (
	"id" text PRIMARY KEY NOT NULL,
	"subscription_id" text NOT NULL,
	"merchant_id" text NOT NULL,
	"amount_kobo" bigint NOT NULL,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"nip_session_id" text,
	"failure_reason" text,
	"charged_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscription_plans_v2" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"price_kobo" bigint NOT NULL,
	"currency" text DEFAULT 'NGN',
	"interval" text NOT NULL,
	"interval_count" integer DEFAULT 1,
	"trial_days" integer DEFAULT 0,
	"features" jsonb,
	"active_subscribers" integer DEFAULT 0,
	"status" text DEFAULT 'active',
	"stripe_product_id" text,
	"stripe_price_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscription_subscribers" (
	"id" text PRIMARY KEY NOT NULL,
	"plan_id" text NOT NULL,
	"merchant_id" text NOT NULL,
	"customer_id" text,
	"customer_name" text NOT NULL,
	"customer_email" text NOT NULL,
	"status" text DEFAULT 'active',
	"start_date" timestamp DEFAULT now() NOT NULL,
	"next_billing_date" timestamp,
	"cancelled_at" timestamp,
	"paused_at" timestamp,
	"total_paid_kobo" bigint DEFAULT 0,
	"stripe_subscription_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"customer_email" text,
	"customer_name" text,
	"customer_phone" text,
	"plan_name" text NOT NULL,
	"amount_kobo" bigint NOT NULL,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"interval" "subscription_interval" DEFAULT 'monthly' NOT NULL,
	"total_cycles" integer,
	"completed_cycles" integer DEFAULT 0 NOT NULL,
	"start_at" timestamp NOT NULL,
	"next_run_at" timestamp NOT NULL,
	"last_run_at" timestamp,
	"status" "subscription_status" DEFAULT 'active' NOT NULL,
	"failure_reason" text,
	"bank_code" text,
	"account_number" text,
	"account_name" text,
	"description" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "super_agent_v2_networks" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"network_name" text NOT NULL,
	"total_agents" integer DEFAULT 0 NOT NULL,
	"active_agents" integer DEFAULT 0 NOT NULL,
	"total_float" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"merchant_id" text,
	"user_id" text,
	"role" text DEFAULT 'user' NOT NULL,
	"content" text NOT NULL,
	"status" text DEFAULT 'sent' NOT NULL,
	"metadata" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tax_filing_records" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"tax_type" text DEFAULT 'VAT' NOT NULL,
	"period" text NOT NULL,
	"taxable_amount" integer DEFAULT 0 NOT NULL,
	"tax_amount" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"filed_at" timestamp,
	"receipt_number" text,
	"due_date" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tax_withholding_records" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"transaction_id" text,
	"gross_amount_kobo" bigint NOT NULL,
	"tax_amount_kobo" bigint DEFAULT 0,
	"net_amount_kobo" bigint NOT NULL,
	"tax_type" text DEFAULT 'WHT',
	"tax_rate_pct" text NOT NULL,
	"period" text NOT NULL,
	"status" text DEFAULT 'pending',
	"remitted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"merchant_id" text NOT NULL,
	"user_id" integer,
	"email" text NOT NULL,
	"name" text,
	"role" "team_role" DEFAULT 'viewer' NOT NULL,
	"status" "team_status" DEFAULT 'invited' NOT NULL,
	"invite_token" text,
	"invite_expires_at" timestamp,
	"joined_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "team_members_tenant_merchant_email_uniq" UNIQUE("tenant_id","merchant_id","email")
);
--> statement-breakpoint
CREATE TABLE "temporal_consistency_checks" (
	"id" text PRIMARY KEY NOT NULL,
	"submission_id" text NOT NULL,
	"merchant_id" text NOT NULL,
	"check_type" text NOT NULL,
	"field_a" text,
	"field_b" text,
	"passed" boolean NOT NULL,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "temporal_workflow_instances" (
	"id" text PRIMARY KEY NOT NULL,
	"workflow_id" text NOT NULL,
	"run_id" text,
	"workflow_type" text NOT NULL,
	"status" text DEFAULT 'RUNNING' NOT NULL,
	"input" text,
	"result" text,
	"error_message" text,
	"started_at" timestamp DEFAULT now(),
	"completed_at" timestamp,
	"entity_id" text,
	"entity_type" text,
	CONSTRAINT "temporal_workflow_instances_workflow_id_unique" UNIQUE("workflow_id")
);
--> statement-breakpoint
CREATE TABLE "tenant_billing_invoices" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"period" text NOT NULL,
	"amount_usd" real DEFAULT 0 NOT NULL,
	"status" "tenant_invoice_status" DEFAULT 'open' NOT NULL,
	"stripe_invoice_id" text,
	"stripe_payment_intent_id" text,
	"paid_at" timestamp,
	"due_date" timestamp,
	"line_items" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_config" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"card_fees_bps" integer DEFAULT 150 NOT NULL,
	"bank_transfer_fees_bps" integer DEFAULT 50 NOT NULL,
	"mobile_money_fees_bps" integer DEFAULT 100 NOT NULL,
	"cross_border_fees_bps" integer DEFAULT 200 NOT NULL,
	"bnpl_fees_bps" integer DEFAULT 300 NOT NULL,
	"fx_spread_bps" integer DEFAULT 150 NOT NULL,
	"settlement_frequency" "settlement_freq" DEFAULT 'daily' NOT NULL,
	"settlement_cutoff_hour" integer DEFAULT 18 NOT NULL,
	"settlement_min_amount" bigint DEFAULT 10000 NOT NULL,
	"bnpl_max_installments" integer DEFAULT 12 NOT NULL,
	"bnpl_max_loan_amount" bigint DEFAULT 5000000 NOT NULL,
	"bnpl_interest_rate_bps" integer DEFAULT 200 NOT NULL,
	"api_rate_limit_rpm" integer DEFAULT 1000 NOT NULL,
	"payout_approval_threshold" bigint DEFAULT 500000 NOT NULL,
	"payout_approval_enabled" boolean DEFAULT false NOT NULL,
	"settlement_sla_hours" integer DEFAULT 2 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"updated_by" text,
	CONSTRAINT "tenant_config_tenant_id_unique" UNIQUE("tenant_id")
);
--> statement-breakpoint
CREATE TABLE "tenant_corridor_daily_stats" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"corridor_id" text NOT NULL,
	"date" text NOT NULL,
	"tx_count" integer DEFAULT 0 NOT NULL,
	"volume_usd" real DEFAULT 0 NOT NULL,
	"fees_collected_usd" real DEFAULT 0 NOT NULL,
	"avg_fx_rate" real,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_corridors" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"source_currency" text NOT NULL,
	"dest_currency" text NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"fx_markup_pct" real DEFAULT 1.5 NOT NULL,
	"daily_limit_usd" real DEFAULT 50000 NOT NULL,
	"min_amount_usd" real DEFAULT 1 NOT NULL,
	"max_amount_usd" real DEFAULT 10000 NOT NULL,
	"flat_fee_usd" real DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_fee_overrides" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"transaction_type" text NOT NULL,
	"flat_fee_ngn" real DEFAULT 0 NOT NULL,
	"percentage_fee" real DEFAULT 1.5 NOT NULL,
	"cap_ngn" real,
	"floor_ngn" real,
	"is_active" boolean DEFAULT true NOT NULL,
	"effective_from" timestamp DEFAULT now() NOT NULL,
	"effective_to" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_plan_limits" (
	"id" text PRIMARY KEY NOT NULL,
	"plan" text NOT NULL,
	"max_api_calls_per_month" integer DEFAULT 10000 NOT NULL,
	"max_tx_volume_usd_per_month" real DEFAULT 100000 NOT NULL,
	"max_users" integer DEFAULT 5 NOT NULL,
	"max_corridors" integer DEFAULT 3 NOT NULL,
	"max_webhooks" integer DEFAULT 5 NOT NULL,
	"max_api_keys" integer DEFAULT 3 NOT NULL,
	"price_usd_per_month" real DEFAULT 0 NOT NULL,
	"stripe_price_id" text,
	"features" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_plan_limits_plan_unique" UNIQUE("plan")
);
--> statement-breakpoint
CREATE TABLE "tenant_sso_configs" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"protocol" "sso_protocol_enum" DEFAULT 'oidc' NOT NULL,
	"is_enabled" boolean DEFAULT false NOT NULL,
	"entity_id" text,
	"sso_url" text,
	"slo_url" text,
	"certificate" text,
	"client_id" text,
	"client_secret" text,
	"discovery_url" text,
	"scopes" text DEFAULT 'openid email profile',
	"attribute_mapping" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_sso_configs_tenant_id_unique" UNIQUE("tenant_id")
);
--> statement-breakpoint
CREATE TABLE "tenant_usage_metrics" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"period" text NOT NULL,
	"api_calls" integer DEFAULT 0 NOT NULL,
	"tx_volume" real DEFAULT 0 NOT NULL,
	"tx_count" integer DEFAULT 0 NOT NULL,
	"storage_bytes" integer DEFAULT 0 NOT NULL,
	"active_users" integer DEFAULT 0 NOT NULL,
	"webhook_deliveries" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transaction_receipts" (
	"id" text PRIMARY KEY NOT NULL,
	"transaction_id" text NOT NULL,
	"user_id" integer,
	"merchant_id" text,
	"receipt_number" text NOT NULL,
	"pdf_url" text,
	"email_sent_at" timestamp,
	"email_address" text,
	"view_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "transaction_receipts_transaction_id_unique" UNIQUE("transaction_id"),
	CONSTRAINT "transaction_receipts_receipt_number_unique" UNIQUE("receipt_number")
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"merchant_id" text NOT NULL,
	"reference" text NOT NULL,
	"amount" bigint NOT NULL,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"status" "tx_status" DEFAULT 'pending' NOT NULL,
	"channel" "tx_channel" DEFAULT 'card' NOT NULL,
	"customer_email" text,
	"customer_name" text,
	"customer_phone" text,
	"description" text,
	"fee_amount" bigint DEFAULT 0 NOT NULL,
	"net_amount" bigint DEFAULT 0 NOT NULL,
	"metadata" jsonb,
	"completed_at" timestamp,
	"gnn_score" real,
	"gnn_ring_detected" boolean DEFAULT false NOT NULL,
	"gnn_scored_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "transactions_tenant_ref_uniq" UNIQUE("tenant_id","reference")
);
--> statement-breakpoint
CREATE TABLE "transfer_disputes" (
	"id" text PRIMARY KEY NOT NULL,
	"transfer_id" text NOT NULL,
	"initiated_by_dfsp_id" text NOT NULL,
	"responding_dfsp_id" text,
	"dispute_type" text NOT NULL,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"amount_kobo" bigint NOT NULL,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"reason" text NOT NULL,
	"evidence" text,
	"resolution" text,
	"resolution_notes" text,
	"penalty_amount_kobo" bigint DEFAULT 0,
	"reversal_transfer_id" text,
	"tigerbeetle_penalty_transfer_id" text,
	"sla_deadline" timestamp,
	"resolved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ubo_owners" (
	"id" text PRIMARY KEY NOT NULL,
	"verification_id" text NOT NULL,
	"merchant_id" text NOT NULL,
	"full_name" text NOT NULL,
	"bvn" text,
	"nin" text,
	"ownership_pct" real NOT NULL,
	"is_pep" boolean DEFAULT false NOT NULL,
	"kyc_status" text DEFAULT 'pending',
	"kyc_submission_id" text,
	"adverse_media_flagged" boolean DEFAULT false,
	"adverse_media_note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usdc_deposits" (
	"id" text PRIMARY KEY NOT NULL,
	"wallet_address" text NOT NULL,
	"merchant_id" text,
	"amount_lamports" bigint NOT NULL,
	"solana_signature" text NOT NULL,
	"solana_slot" bigint,
	"network" text DEFAULT 'mainnet' NOT NULL,
	"detected_at" timestamp DEFAULT now() NOT NULL,
	"processed_at" timestamp,
	CONSTRAINT "usdc_deposits_solana_signature_unique" UNIQUE("solana_signature")
);
--> statement-breakpoint
CREATE TABLE "usdc_payouts" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"recipient_wallet" text NOT NULL,
	"amount_lamports" bigint NOT NULL,
	"tb_pending_transfer_id" text,
	"tb_posted_transfer_id" text,
	"solana_signature" text,
	"solana_slot" bigint,
	"temporal_workflow_id" text,
	"temporal_run_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"failure_reason" text,
	"fraud_score" integer,
	"fraud_signals" text[],
	"reference" text,
	"network" text DEFAULT 'mainnet' NOT NULL,
	"initiated_at" timestamp DEFAULT now() NOT NULL,
	"settled_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usdc_v2_transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"type" text DEFAULT 'receive' NOT NULL,
	"amount_usdc" text DEFAULT '0' NOT NULL,
	"amount_ngn" integer,
	"tx_hash" text,
	"from_address" text,
	"to_address" text,
	"network" text DEFAULT 'polygon' NOT NULL,
	"status" text DEFAULT 'confirmed' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usdc_v2_wallets" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"wallet_address" text NOT NULL,
	"network" text DEFAULT 'polygon' NOT NULL,
	"balance_usdc" text DEFAULT '0' NOT NULL,
	"balance_ngn" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "usdc_v2_wallets_merchant_id_unique" UNIQUE("merchant_id")
);
--> statement-breakpoint
CREATE TABLE "user_insurance_claims" (
	"id" text PRIMARY KEY NOT NULL,
	"policy_id" text NOT NULL,
	"user_id" integer NOT NULL,
	"claim_type" text NOT NULL,
	"description" text NOT NULL,
	"claim_amount_kobo" bigint NOT NULL,
	"incident_date" text NOT NULL,
	"status" text DEFAULT 'submitted',
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_locale_preferences" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"locale" text DEFAULT 'en-NG' NOT NULL,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"timezone" text DEFAULT 'Africa/Lagos' NOT NULL,
	"date_format" text DEFAULT 'DD/MM/YYYY' NOT NULL,
	"number_format" text DEFAULT '1,234.56' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_locale_preferences_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"open_id" text NOT NULL,
	"name" text,
	"email" text,
	"login_method" text,
	"password_hash" text,
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"tenant_id" text,
	"last_signed_in" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_open_id_unique" UNIQUE("open_id")
);
--> statement-breakpoint
CREATE TABLE "ussd_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"tenant_id" text DEFAULT 'ten_default' NOT NULL,
	"session_id" text NOT NULL,
	"msisdn" text NOT NULL,
	"service_code" text DEFAULT '*737*1#' NOT NULL,
	"status" "ussd_status" DEFAULT 'active' NOT NULL,
	"steps" integer DEFAULT 0 NOT NULL,
	"last_input" text,
	"amount_kobo" integer,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"ended_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "velocity_breaches" (
	"id" serial PRIMARY KEY NOT NULL,
	"limit_config_id" integer NOT NULL,
	"merchant_id" varchar(64) NOT NULL,
	"channel" varchar(32) NOT NULL,
	"amount_kobo" integer DEFAULT 0 NOT NULL,
	"user_id" integer DEFAULT 0 NOT NULL,
	"details" text,
	"breached_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "velocity_limit_configs" (
	"id" serial PRIMARY KEY NOT NULL,
	"merchant_id" varchar(64),
	"channel" varchar(32) DEFAULT 'all' NOT NULL,
	"limit_type" varchar(16) DEFAULT 'count' NOT NULL,
	"max_value" integer NOT NULL,
	"window_seconds" integer DEFAULT 3600 NOT NULL,
	"is_active" integer DEFAULT 1 NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "verifiable_credentials" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" varchar(64) NOT NULL,
	"individual_id" varchar(64) NOT NULL,
	"format" varchar(32) DEFAULT 'ldp_vc' NOT NULL,
	"credential_data" jsonb NOT NULL,
	"c_nonce" varchar(128),
	"issued_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp,
	"revoked_at" timestamp,
	"status" varchar(32) DEFAULT 'ACTIVE' NOT NULL,
	"partner_id" varchar(64),
	"session_id" integer
);
--> statement-breakpoint
CREATE TABLE "virtual_cards" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"merchant_id" text NOT NULL,
	"masked_pan" text NOT NULL,
	"brand" "card_brand" DEFAULT 'visa' NOT NULL,
	"expiry_month" integer NOT NULL,
	"expiry_year" integer NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"status" "card_status" DEFAULT 'active' NOT NULL,
	"balance" bigint DEFAULT 0 NOT NULL,
	"spend_limit" bigint,
	"label" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wallet_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"wallet_id" integer NOT NULL,
	"type" text NOT NULL,
	"amount" text NOT NULL,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"balance_before" text NOT NULL,
	"balance_after" text NOT NULL,
	"description" text NOT NULL,
	"reference" text NOT NULL,
	"channel" text NOT NULL,
	"counterparty_id" text,
	"counterparty_name" text,
	"status" text DEFAULT 'completed' NOT NULL,
	"metadata" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "wallet_tx_tenant_ref_uniq" UNIQUE("tenant_id","reference")
);
--> statement-breakpoint
CREATE TABLE "wallets" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"user_id" text NOT NULL,
	"merchant_id" text,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"balance" text DEFAULT '0' NOT NULL,
	"ledger_balance" text DEFAULT '0' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"tier" text DEFAULT 'basic' NOT NULL,
	"daily_limit" text DEFAULT '50000' NOT NULL,
	"monthly_limit" text DEFAULT '500000' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wealth_goals" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"name" text NOT NULL,
	"category" text DEFAULT 'general',
	"target_amount_kobo" bigint NOT NULL,
	"current_amount_kobo" bigint DEFAULT 0,
	"deadline" timestamp,
	"status" text DEFAULT 'active',
	"progress_pct" text DEFAULT '0',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wealth_risk_profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"risk_score" integer DEFAULT 5,
	"risk_category" text DEFAULT 'moderate',
	"investment_horizon" text DEFAULT '5-10 years',
	"last_assessed" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "wealth_risk_profiles_merchant_id_unique" UNIQUE("merchant_id")
);
--> statement-breakpoint
CREATE TABLE "webhook_deliveries" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"webhook_id" text NOT NULL,
	"merchant_id" text NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"response_status" integer,
	"response_body" text,
	"latency_ms" integer,
	"status" "webhook_delivery_status" DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"next_retry_at" timestamp,
	"delivered_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_delivery_log" (
	"id" text PRIMARY KEY NOT NULL,
	"endpoint_id" text NOT NULL,
	"merchant_id" text NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb,
	"status_code" integer,
	"success" integer DEFAULT 0,
	"attempt" integer DEFAULT 1,
	"delivered_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_endpoints" (
	"endpoint_id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"url" text NOT NULL,
	"secret" text NOT NULL,
	"events" jsonb,
	"is_active" integer DEFAULT 1,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_simulator_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"webhook_id" text,
	"event_type" text NOT NULL,
	"payload" text NOT NULL,
	"response_status" integer,
	"response_body" text,
	"duration_ms" integer,
	"success" boolean DEFAULT false NOT NULL,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhooks" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"merchant_id" text NOT NULL,
	"url" text NOT NULL,
	"events" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"secret" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_delivered_at" timestamp,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tenant_api_keys" ADD CONSTRAINT "tenant_api_keys_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_branding" ADD CONSTRAINT "tenant_branding_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_members" ADD CONSTRAINT "tenant_members_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_notification_prefs" ADD CONSTRAINT "admin_notification_prefs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_payments" ADD CONSTRAINT "bill_payments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_payments" ADD CONSTRAINT "bill_payments_wallet_id_consumer_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."consumer_wallets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_audit_log" ADD CONSTRAINT "billing_audit_log_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_audit_log" ADD CONSTRAINT "billing_audit_log_billing_config_id_billing_configs_id_fk" FOREIGN KEY ("billing_config_id") REFERENCES "public"."billing_configs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_configs" ADD CONSTRAINT "billing_configs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_events" ADD CONSTRAINT "billing_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bnpl_loans" ADD CONSTRAINT "bnpl_loans_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bnpl_loans" ADD CONSTRAINT "bnpl_loans_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bnpl_loans" ADD CONSTRAINT "bnpl_loans_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bnpl_loans" ADD CONSTRAINT "bnpl_loans_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bnpl_plans" ADD CONSTRAINT "bnpl_plans_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_documents" ADD CONSTRAINT "claim_documents_claim_id_user_insurance_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."user_insurance_claims"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_budgets" ADD CONSTRAINT "consumer_budgets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_cards" ADD CONSTRAINT "consumer_cards_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_cards" ADD CONSTRAINT "consumer_cards_wallet_id_consumer_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."consumer_wallets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_contacts" ADD CONSTRAINT "consumer_contacts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_contacts" ADD CONSTRAINT "consumer_contacts_contact_user_id_users_id_fk" FOREIGN KEY ("contact_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_disputes" ADD CONSTRAINT "consumer_disputes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_disputes" ADD CONSTRAINT "consumer_disputes_wallet_txn_id_consumer_wallet_txns_id_fk" FOREIGN KEY ("wallet_txn_id") REFERENCES "public"."consumer_wallet_txns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_fraud_flags" ADD CONSTRAINT "consumer_fraud_flags_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_fraud_flags" ADD CONSTRAINT "consumer_fraud_flags_wallet_txn_id_consumer_wallet_txns_id_fk" FOREIGN KEY ("wallet_txn_id") REFERENCES "public"."consumer_wallet_txns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_fraud_flags" ADD CONSTRAINT "consumer_fraud_flags_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_idempotency_keys" ADD CONSTRAINT "consumer_idempotency_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_kyc_records" ADD CONSTRAINT "consumer_kyc_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_loyalty_accounts" ADD CONSTRAINT "consumer_loyalty_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_loyalty_txns" ADD CONSTRAINT "consumer_loyalty_txns_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_notification_prefs" ADD CONSTRAINT "consumer_notification_prefs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_phone_verifications" ADD CONSTRAINT "consumer_phone_verifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_pins" ADD CONSTRAINT "consumer_pins_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_recurring_payments" ADD CONSTRAINT "consumer_recurring_payments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_savings_goals" ADD CONSTRAINT "consumer_savings_goals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_split_participants" ADD CONSTRAINT "consumer_split_participants_session_id_consumer_split_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."consumer_split_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_split_participants" ADD CONSTRAINT "consumer_split_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_split_sessions" ADD CONSTRAINT "consumer_split_sessions_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_wallet_txns" ADD CONSTRAINT "consumer_wallet_txns_wallet_id_consumer_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."consumer_wallets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_wallet_txns" ADD CONSTRAINT "consumer_wallet_txns_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_wallets" ADD CONSTRAINT "consumer_wallets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corridor_live_stats" ADD CONSTRAINT "corridor_live_stats_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_coupon_id_coupons_id_fk" FOREIGN KEY ("coupon_id") REFERENCES "public"."coupons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cross_border_transfers" ADD CONSTRAINT "cross_border_transfers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cross_border_transfers" ADD CONSTRAINT "cross_border_transfers_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cross_border_transfers" ADD CONSTRAINT "cross_border_transfers_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fraud_alert_comments" ADD CONSTRAINT "fraud_alert_comments_alert_id_fraud_alerts_id_fk" FOREIGN KEY ("alert_id") REFERENCES "public"."fraud_alerts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fraud_alert_comments" ADD CONSTRAINT "fraud_alert_comments_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fraud_alerts" ADD CONSTRAINT "fraud_alerts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fraud_alerts" ADD CONSTRAINT "fraud_alerts_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fraud_alerts" ADD CONSTRAINT "fraud_alerts_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fraud_alerts" ADD CONSTRAINT "fraud_alerts_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fx_alerts" ADD CONSTRAINT "fx_alerts_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_requests" ADD CONSTRAINT "idempotency_requests_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kyc_submissions" ADD CONSTRAINT "kyc_submissions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kyc_submissions" ADD CONSTRAINT "kyc_submissions_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kyc_submissions" ADD CONSTRAINT "kyc_submissions_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "liveness_sessions" ADD CONSTRAINT "liveness_sessions_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "liveness_sessions" ADD CONSTRAINT "liveness_sessions_submission_id_kyc_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."kyc_submissions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchants" ADD CONSTRAINT "merchants_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchants" ADD CONSTRAINT "merchants_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mobile_money_recon" ADD CONSTRAINT "mobile_money_recon_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mobile_money_recon" ADD CONSTRAINT "mobile_money_recon_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mobile_money_recon" ADD CONSTRAINT "mobile_money_recon_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "money_requests" ADD CONSTRAINT "money_requests_requester_id_users_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "money_requests" ADD CONSTRAINT "money_requests_payer_user_id_users_id_fk" FOREIGN KEY ("payer_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nip_account_cache" ADD CONSTRAINT "nip_account_cache_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "overhead_costs" ADD CONSTRAINT "overhead_costs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "p2p_transfers" ADD CONSTRAINT "p2p_transfers_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "p2p_transfers" ADD CONSTRAINT "p2p_transfers_sender_wallet_id_consumer_wallets_id_fk" FOREIGN KEY ("sender_wallet_id") REFERENCES "public"."consumer_wallets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_links" ADD CONSTRAINT "payment_links_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_links" ADD CONSTRAINT "payment_links_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_terminals" ADD CONSTRAINT "pos_terminals_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_transactions" ADD CONSTRAINT "pos_transactions_terminal_id_pos_terminals_id_fk" FOREIGN KEY ("terminal_id") REFERENCES "public"."pos_terminals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qr_payments" ADD CONSTRAINT "qr_payments_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qr_payments" ADD CONSTRAINT "qr_payments_claimed_by_users_id_fk" FOREIGN KEY ("claimed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "red_envelope_claims" ADD CONSTRAINT "red_envelope_claims_envelope_id_red_envelopes_id_fk" FOREIGN KEY ("envelope_id") REFERENCES "public"."red_envelopes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "red_envelope_claims" ADD CONSTRAINT "red_envelope_claims_claimant_id_users_id_fk" FOREIGN KEY ("claimant_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "red_envelope_claims" ADD CONSTRAINT "red_envelope_claims_claimant_wallet_id_consumer_wallets_id_fk" FOREIGN KEY ("claimant_wallet_id") REFERENCES "public"."consumer_wallets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "red_envelopes" ADD CONSTRAINT "red_envelopes_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "red_envelopes" ADD CONSTRAINT "red_envelopes_sender_wallet_id_consumer_wallets_id_fk" FOREIGN KEY ("sender_wallet_id") REFERENCES "public"."consumer_wallets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referrer_id_users_id_fk" FOREIGN KEY ("referrer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referee_id_users_id_fk" FOREIGN KEY ("referee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_beneficiaries" ADD CONSTRAINT "saved_beneficiaries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_net_positions" ADD CONSTRAINT "settlement_net_positions_window_id_settlement_windows_id_fk" FOREIGN KEY ("window_id") REFERENCES "public"."settlement_windows"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_charges" ADD CONSTRAINT "subscription_charges_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_config" ADD CONSTRAINT "tenant_config_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_receipts" ADD CONSTRAINT "transaction_receipts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ussd_sessions" ADD CONSTRAINT "ussd_sessions_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "virtual_cards" ADD CONSTRAINT "virtual_cards_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "virtual_cards" ADD CONSTRAINT "virtual_cards_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_webhook_id_webhooks_id_fk" FOREIGN KEY ("webhook_id") REFERENCES "public"."webhooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhooks" ADD CONSTRAINT "webhooks_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhooks" ADD CONSTRAINT "webhooks_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "nqr_mp_tenant_idx" ON "nqr_merchant_profiles" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "nqr_mp_active_idx" ON "nqr_merchant_profiles" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "nqr_merchant_idx" ON "nqr_transactions" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "nqr_status_idx" ON "nqr_transactions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "nqr_expires_idx" ON "nqr_transactions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "nqr_tenant_idx" ON "nqr_transactions" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "nqr_merchant_status_idx" ON "nqr_transactions" USING btree ("merchant_id","status");--> statement-breakpoint
CREATE INDEX "nqr_pending_expires_idx" ON "nqr_transactions" USING btree ("status","expires_at");--> statement-breakpoint
CREATE INDEX "tenant_api_keys_tenant_idx" ON "tenant_api_keys" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_api_keys_hash_idx" ON "tenant_api_keys" USING btree ("key_hash");--> statement-breakpoint
CREATE INDEX "tenant_audit_log_tenant_idx" ON "tenant_audit_log" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "tenant_audit_log_created_idx" ON "tenant_audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_branding_tenant_idx" ON "tenant_branding" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "tenant_branding_domain_idx" ON "tenant_branding" USING btree ("custom_domain");--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_members_unique_idx" ON "tenant_members" USING btree ("tenant_id","user_id");--> statement-breakpoint
CREATE INDEX "tenant_members_tenant_idx" ON "tenant_members" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "tenant_members_user_idx" ON "tenant_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "tenants_status_idx" ON "tenants" USING btree ("status");--> statement-breakpoint
CREATE INDEX "tenants_slug_idx" ON "tenants" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "biometric_verifications_tenant_dfsp_idx" ON "biometric_verifications" USING btree ("tenant_id","requesting_dfsp");--> statement-breakpoint
CREATE INDEX "biometric_verifications_status_idx" ON "biometric_verifications" USING btree ("status");--> statement-breakpoint
CREATE INDEX "biometric_verifications_correlation_idx" ON "biometric_verifications" USING btree ("correlation_id");--> statement-breakpoint
CREATE INDEX "biometric_verifications_created_at_idx" ON "biometric_verifications" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "cb_liquidity_dfsp_window_idx" ON "cb_liquidity_positions" USING btree ("dfsp_id","settlement_window_id","currency");--> statement-breakpoint
CREATE INDEX "cb_liquidity_tenant_date_idx" ON "cb_liquidity_positions" USING btree ("tenant_id","position_date");--> statement-breakpoint
CREATE UNIQUE INDEX "dict_aliases_hash_idx" ON "dict_aliases" USING btree ("alias_hash");--> statement-breakpoint
CREATE INDEX "dict_aliases_value_idx" ON "dict_aliases" USING btree ("alias_type","alias_value");--> statement-breakpoint
CREATE INDEX "dict_aliases_dfsp_idx" ON "dict_aliases" USING btree ("dfsp_id");--> statement-breakpoint
CREATE INDEX "dict_aliases_active_idx" ON "dict_aliases" USING btree ("is_active","alias_type");--> statement-breakpoint
CREATE INDEX "dict_aliases_tenant_idx" ON "dict_aliases" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "dispute_chargebacks_workflow_idx" ON "dispute_chargebacks" USING btree ("workflow_id");--> statement-breakpoint
CREATE INDEX "dispute_chargebacks_status_idx" ON "dispute_chargebacks" USING btree ("status");--> statement-breakpoint
CREATE INDEX "dispute_chargebacks_tenant_idx" ON "dispute_chargebacks" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "dispute_chargebacks_from_dfsp_idx" ON "dispute_chargebacks" USING btree ("from_dfsp","status");--> statement-breakpoint
CREATE INDEX "dispute_decisions_tenant_idx" ON "dispute_decisions" USING btree ("tenant_id","decided_at");--> statement-breakpoint
CREATE INDEX "dispute_decisions_decision_idx" ON "dispute_decisions" USING btree ("decision");--> statement-breakpoint
CREATE INDEX "dispute_evidence_workflow_idx" ON "dispute_evidence" USING btree ("workflow_id");--> statement-breakpoint
CREATE INDEX "dispute_evidence_dfsp_idx" ON "dispute_evidence" USING btree ("submitted_by_dfsp","workflow_id");--> statement-breakpoint
CREATE INDEX "dispute_evidence_tenant_idx" ON "dispute_evidence" USING btree ("tenant_id","submitted_at");--> statement-breakpoint
CREATE INDEX "dispute_ml_scores_workflow_idx" ON "dispute_ml_scores" USING btree ("workflow_id");--> statement-breakpoint
CREATE INDEX "dispute_ml_scores_tenant_idx" ON "dispute_ml_scores" USING btree ("tenant_id","scored_at");--> statement-breakpoint
CREATE INDEX "dispute_ml_scores_fraud_score_idx" ON "dispute_ml_scores" USING btree ("fraud_score");--> statement-breakpoint
CREATE INDEX "dispute_workflows_status_idx" ON "dispute_workflows" USING btree ("status");--> statement-breakpoint
CREATE INDEX "dispute_workflows_tenant_status_idx" ON "dispute_workflows" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "dispute_workflows_transfer_idx" ON "dispute_workflows" USING btree ("transfer_id");--> statement-breakpoint
CREATE INDEX "dispute_workflows_payer_dfsp_idx" ON "dispute_workflows" USING btree ("payer_dfsp");--> statement-breakpoint
CREATE INDEX "dispute_workflows_payee_dfsp_idx" ON "dispute_workflows" USING btree ("payee_dfsp");--> statement-breakpoint
CREATE INDEX "dispute_workflows_sla_deadline_idx" ON "dispute_workflows" USING btree ("sla_deadline","status");--> statement-breakpoint
CREATE INDEX "dispute_workflows_evidence_deadline_idx" ON "dispute_workflows" USING btree ("evidence_deadline","status");--> statement-breakpoint
CREATE UNIQUE INDEX "hsm_keys_label_idx" ON "hsm_keys" USING btree ("key_label","tenant_id");--> statement-breakpoint
CREATE INDEX "hsm_keys_status_idx" ON "hsm_keys" USING btree ("key_status");--> statement-breakpoint
CREATE INDEX "hsm_keys_purpose_idx" ON "hsm_keys" USING btree ("purpose","key_status");--> statement-breakpoint
CREATE INDEX "hsm_keys_expiry_idx" ON "hsm_keys" USING btree ("expires_at","key_status");--> statement-breakpoint
CREATE INDEX "hsm_keys_tenant_idx" ON "hsm_keys" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "hsm_operations_key_idx" ON "hsm_operations" USING btree ("key_id");--> statement-breakpoint
CREATE INDEX "hsm_operations_tenant_idx" ON "hsm_operations" USING btree ("tenant_id","performed_at");--> statement-breakpoint
CREATE INDEX "hsm_operations_correlation_idx" ON "hsm_operations" USING btree ("correlation_id");--> statement-breakpoint
CREATE INDEX "hsm_operations_caller_idx" ON "hsm_operations" USING btree ("caller_service","performed_at");--> statement-breakpoint
CREATE INDEX "hsm_operations_success_idx" ON "hsm_operations" USING btree ("success","performed_at");--> statement-breakpoint
CREATE INDEX "identity_lookups_tenant_dfsp_idx" ON "identity_lookups" USING btree ("tenant_id","requesting_dfsp");--> statement-breakpoint
CREATE INDEX "identity_lookups_alias_hash_idx" ON "identity_lookups" USING btree ("alias_hash");--> statement-breakpoint
CREATE INDEX "identity_lookups_created_at_idx" ON "identity_lookups" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "identity_lookups_correlation_idx" ON "identity_lookups" USING btree ("correlation_id");--> statement-breakpoint
CREATE INDEX "key_rotation_log_tenant_idx" ON "key_rotation_log" USING btree ("tenant_id","rotation_started_at");--> statement-breakpoint
CREATE INDEX "key_rotation_log_old_key_idx" ON "key_rotation_log" USING btree ("old_key_id");--> statement-breakpoint
CREATE INDEX "key_rotation_log_new_key_idx" ON "key_rotation_log" USING btree ("new_key_id");--> statement-breakpoint
CREATE INDEX "rtgs_messages_submission_idx" ON "rtgs_messages" USING btree ("submission_id");--> statement-breakpoint
CREATE INDEX "rtgs_messages_direction_idx" ON "rtgs_messages" USING btree ("direction","created_at");--> statement-breakpoint
CREATE INDEX "rtgs_submissions_status_idx" ON "rtgs_submissions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "rtgs_submissions_window_idx" ON "rtgs_submissions" USING btree ("settlement_window_id");--> statement-breakpoint
CREATE INDEX "rtgs_submissions_tenant_status_idx" ON "rtgs_submissions" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "rtgs_submissions_submitted_at_idx" ON "rtgs_submissions" USING btree ("submitted_at");--> statement-breakpoint
CREATE INDEX "rtgs_submissions_retry_idx" ON "rtgs_submissions" USING btree ("status","next_retry_at");--> statement-breakpoint
CREATE INDEX "a11y_fallback_merchant_idx" ON "accessibility_fallback_sessions" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "a11y_fallback_status_idx" ON "accessibility_fallback_sessions" USING btree ("review_status");--> statement-breakpoint
CREATE INDEX "admin_notif_pref_user_idx" ON "admin_notification_prefs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "adverse_media_entity_idx" ON "adverse_media_screenings" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "adverse_media_merchant_idx" ON "adverse_media_screenings" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "adverse_media_flagged_idx" ON "adverse_media_screenings" USING btree ("flagged");--> statement-breakpoint
CREATE INDEX "ab_v4_merchant_idx" ON "agent_banking_v4_agents" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "agent_network_super_idx" ON "agent_network" USING btree ("super_agent_merchant_id");--> statement-breakpoint
CREATE INDEX "ai_audit_txn_idx" ON "ai_audit_trail" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "ai_audit_merchant_idx" ON "ai_audit_trail" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "ai_audit_decision_idx" ON "ai_audit_trail" USING btree ("decision");--> statement-breakpoint
CREATE INDEX "ai_audit_created_idx" ON "ai_audit_trail" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "ai_model_type_idx" ON "ai_model_registry" USING btree ("model_type");--> statement-breakpoint
CREATE INDEX "ai_model_status_idx" ON "ai_model_registry" USING btree ("status");--> statement-breakpoint
CREATE INDEX "anomaly_config_audit_user_idx" ON "anomaly_config_audit" USING btree ("changed_by_user_id");--> statement-breakpoint
CREATE INDEX "anomaly_config_audit_changed_at_idx" ON "anomaly_config_audit" USING btree ("changed_at");--> statement-breakpoint
CREATE INDEX "api_keys_tenant_idx" ON "api_keys" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "api_keys_merchant_idx" ON "api_keys" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "audit_merchant_idx" ON "audit_events" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "audit_actor_idx" ON "audit_events" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "audit_action_idx" ON "audit_events" USING btree ("action");--> statement-breakpoint
CREATE INDEX "audit_created_idx" ON "audit_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "bp_user_idx" ON "bill_payments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "bp_status_idx" ON "bill_payments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "bp_created_idx" ON "bill_payments" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "billing_audit_tenant_idx" ON "billing_audit_log" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "billing_audit_actor_idx" ON "billing_audit_log" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "billing_audit_config_idx" ON "billing_audit_log" USING btree ("billing_config_id");--> statement-breakpoint
CREATE INDEX "billing_config_tenant_idx" ON "billing_configs" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "billing_config_active_idx" ON "billing_configs" USING btree ("tenant_id","active");--> statement-breakpoint
CREATE INDEX "billing_event_tenant_idx" ON "billing_events" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "billing_event_merchant_idx" ON "billing_events" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "billing_event_occurred_idx" ON "billing_events" USING btree ("tenant_id","occurred_at");--> statement-breakpoint
CREATE INDEX "bnpl_tenant_idx" ON "bnpl_loans" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "bnpl_merchant_idx" ON "bnpl_loans" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "bnpl_status_idx" ON "bnpl_loans" USING btree ("status");--> statement-breakpoint
CREATE INDEX "bnpl_plan_merchant_idx" ON "bnpl_plans" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "bnpl_repay_loan_idx" ON "bnpl_repayment_schedules" USING btree ("bnpl_loan_id");--> statement-breakpoint
CREATE INDEX "bnpl_repay_user_idx" ON "bnpl_repayment_schedules" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "bnpl_repay_due_idx" ON "bnpl_repayment_schedules" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX "bnpl_repay_status_idx" ON "bnpl_repayment_schedules" USING btree ("status");--> statement-breakpoint
CREATE INDEX "bci_collection_idx" ON "bulk_collection_items" USING btree ("collection_id");--> statement-breakpoint
CREATE INDEX "bc_merchant_idx" ON "bulk_collections" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "bps_merchant_idx" ON "bulk_payment_schedules" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "bps_status_idx" ON "bulk_payment_schedules" USING btree ("status");--> statement-breakpoint
CREATE INDEX "bps_scheduled_idx" ON "bulk_payment_schedules" USING btree ("scheduled_at");--> statement-breakpoint
CREATE INDEX "cc_v2_tx_merchant_idx" ON "carbon_credit_transactions_v2" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "cc_merchant_idx" ON "carbon_credits" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "cc_status_idx" ON "carbon_credits" USING btree ("status");--> statement-breakpoint
CREATE INDEX "cc_v2_merchant_idx" ON "carbon_credits_v2" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "cb_merchant_idx" ON "cashback_balances" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "cbt_merchant_idx" ON "cashback_transactions" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "cbdc_acc_rail_idx" ON "cbdc_accounts" USING btree ("rail");--> statement-breakpoint
CREATE INDEX "cbdc_acc_owner_idx" ON "cbdc_accounts" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "cbdc_acc_wallet_idx" ON "cbdc_accounts" USING btree ("wallet_id");--> statement-breakpoint
CREATE INDEX "cbdc_tx_rail_idx" ON "cbdc_transfers" USING btree ("rail");--> statement-breakpoint
CREATE INDEX "cbdc_tx_status_idx" ON "cbdc_transfers" USING btree ("status");--> statement-breakpoint
CREATE INDEX "chargebacks_merchant_idx" ON "chargebacks" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "chargebacks_status_idx" ON "chargebacks" USING btree ("status");--> statement-breakpoint
CREATE INDEX "chargebacks_due_date_idx" ON "chargebacks" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX "claim_docs_claim_idx" ON "claim_documents" USING btree ("claim_id");--> statement-breakpoint
CREATE INDEX "claim_docs_user_idx" ON "claim_documents" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "cr_merchant_idx" ON "compliance_reports" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "cr_status_idx" ON "compliance_reports" USING btree ("status");--> statement-breakpoint
CREATE INDEX "consumer_budgets_user_idx" ON "consumer_budgets" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "consumer_budgets_category_idx" ON "consumer_budgets" USING btree ("category");--> statement-breakpoint
CREATE INDEX "cc_card_user_idx" ON "consumer_cards" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "cc_user_idx" ON "consumer_contacts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "cd_user_idx" ON "consumer_disputes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "cd_status_idx" ON "consumer_disputes" USING btree ("status");--> statement-breakpoint
CREATE INDEX "cfl_customer_idx" ON "consumer_finance_loans" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "cfl_merchant_idx" ON "consumer_finance_loans" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "cfl_status_idx" ON "consumer_finance_loans" USING btree ("status");--> statement-breakpoint
CREATE INDEX "cff_user_idx" ON "consumer_fraud_flags" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "cff_status_idx" ON "consumer_fraud_flags" USING btree ("status");--> statement-breakpoint
CREATE INDEX "cff_score_idx" ON "consumer_fraud_flags" USING btree ("risk_score");--> statement-breakpoint
CREATE INDEX "cik_user_idx" ON "consumer_idempotency_keys" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "cik_key_idx" ON "consumer_idempotency_keys" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "cic_policy_idx" ON "consumer_insurance_claims" USING btree ("policy_id");--> statement-breakpoint
CREATE INDEX "cic_merchant_idx" ON "consumer_insurance_claims" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "cip_merchant_idx" ON "consumer_insurance_policies" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "cip_customer_idx" ON "consumer_insurance_policies" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "ckr_user_idx" ON "consumer_kyc_records" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "clt_user_idx" ON "consumer_loyalty_txns" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "consumer_notif_pref_user_idx" ON "consumer_notification_prefs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "co_status_idx" ON "consumer_outbox" USING btree ("status");--> statement-breakpoint
CREATE INDEX "co_aggregate_idx" ON "consumer_outbox" USING btree ("aggregate_id");--> statement-breakpoint
CREATE INDEX "co_created_idx" ON "consumer_outbox" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "cpv_user_idx" ON "consumer_phone_verifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "crp_user_idx" ON "consumer_recurring_payments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "crp_next_run_idx" ON "consumer_recurring_payments" USING btree ("next_run_at");--> statement-breakpoint
CREATE INDEX "savings_goals_user_idx" ON "consumer_savings_goals" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "savings_goals_status_idx" ON "consumer_savings_goals" USING btree ("status");--> statement-breakpoint
CREATE INDEX "csp_session_idx" ON "consumer_split_participants" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "css_creator_idx" ON "consumer_split_sessions" USING btree ("creator_id");--> statement-breakpoint
CREATE INDEX "cwt_wallet_idx" ON "consumer_wallet_txns" USING btree ("wallet_id");--> statement-breakpoint
CREATE INDEX "cwt_user_idx" ON "consumer_wallet_txns" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "cwt_created_idx" ON "consumer_wallet_txns" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "cw_user_idx" ON "consumer_wallets" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "cw_user_currency_idx" ON "consumer_wallets" USING btree ("user_id","currency");--> statement-breakpoint
CREATE INDEX "corridor_live_tenant_idx" ON "corridor_live_stats" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "corridor_live_pair_idx" ON "corridor_live_stats" USING btree ("source_currency","destination_currency");--> statement-breakpoint
CREATE INDEX "cr_coupon_idx" ON "coupon_redemptions" USING btree ("coupon_id");--> statement-breakpoint
CREATE INDEX "cr_user_idx" ON "coupon_redemptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "xborder_tenant_idx" ON "cross_border_transfers" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "xborder_merchant_idx" ON "cross_border_transfers" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "xborder_status_idx" ON "cross_border_transfers" USING btree ("status");--> statement-breakpoint
CREATE INDEX "xborder_rail_idx" ON "cross_border_transfers" USING btree ("rail");--> statement-breakpoint
CREATE INDEX "xborder_created_idx" ON "cross_border_transfers" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "crypto_offramp_v2_merchant_idx" ON "crypto_offramp_v2_transactions" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "customers_tenant_idx" ON "customers" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "customers_merchant_idx" ON "customers" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "customers_merchant_created_idx" ON "customers" USING btree ("merchant_id","created_at");--> statement-breakpoint
CREATE INDEX "dcc_merchant_idx" ON "dcc_transactions" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "dcc_status_idx" ON "dcc_transactions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "push_tokens_merchant_idx" ON "device_push_tokens" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "push_tokens_user_idx" ON "device_push_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "push_tokens_token_idx" ON "device_push_tokens" USING btree ("token");--> statement-breakpoint
CREATE UNIQUE INDEX "push_tokens_device_unique" ON "device_push_tokens" USING btree ("user_id","device_id");--> statement-breakpoint
CREATE INDEX "dgh_merchant_idx" ON "digital_gold_holdings" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "dgt_merchant_idx" ON "digital_gold_transactions" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "disputes_tenant_idx" ON "disputes" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "disputes_merchant_idx" ON "disputes" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "disputes_merchant_created_idx" ON "disputes" USING btree ("merchant_id","created_at");--> statement-breakpoint
CREATE INDEX "ec_merchant_idx" ON "emi_contracts" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "ec_order_idx" ON "emi_contracts" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "ei_contract_idx" ON "emi_installments" USING btree ("emi_contract_id");--> statement-breakpoint
CREATE INDEX "emi_loans_user_idx" ON "emi_loans" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "emi_loans_status_idx" ON "emi_loans" USING btree ("status");--> statement-breakpoint
CREATE INDEX "emi_repay_loan_idx" ON "emi_repayments" USING btree ("loan_id");--> statement-breakpoint
CREATE INDEX "emi_repay_user_idx" ON "emi_repayments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "evt_meter_idx" ON "energy_vend_transactions" USING btree ("meter_number");--> statement-breakpoint
CREATE INDEX "evt_disco_idx" ON "energy_vend_transactions" USING btree ("disco");--> statement-breakpoint
CREATE INDEX "evt_status_idx" ON "energy_vend_transactions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ec_buyer_idx" ON "escrow_contracts" USING btree ("buyer_merchant_id");--> statement-breakpoint
CREATE INDEX "ec_seller_idx" ON "escrow_contracts" USING btree ("seller_merchant_id");--> statement-breakpoint
CREATE INDEX "ec_status_idx" ON "escrow_contracts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "escrow_v2_merchant_idx" ON "escrow_contracts_v2" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "esignet_tenant_idx" ON "esignet_sessions" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "esignet_state_idx" ON "esignet_sessions" USING btree ("state");--> statement-breakpoint
CREATE UNIQUE INDEX "fals_session_idx" ON "face_active_liveness_sessions" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "fals_tenant_idx" ON "face_active_liveness_sessions" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "fals_created_idx" ON "face_active_liveness_sessions" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "fal_request_idx" ON "face_attribute_logs" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "fal_tenant_idx" ON "face_attribute_logs" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "fal_created_idx" ON "face_attribute_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "fbil_partner_idx" ON "face_batch_identify_logs" USING btree ("partner_id");--> statement-breakpoint
CREATE INDEX "fbil_created_idx" ON "face_batch_identify_logs" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "fbas_snapshot_idx" ON "face_bias_audit_snapshots" USING btree ("snapshot_id");--> statement-breakpoint
CREATE INDEX "fbas_generated_idx" ON "face_bias_audit_snapshots" USING btree ("generated_at");--> statement-breakpoint
CREATE INDEX "fbpk_active_idx" ON "face_biometric_public_keys" USING btree ("is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "fbpk_fingerprint_idx" ON "face_biometric_public_keys" USING btree ("fingerprint");--> statement-breakpoint
CREATE UNIQUE INDEX "fddl_request_idx" ON "face_deepfake_logs" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "fddl_tenant_idx" ON "face_deepfake_logs" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "fddl_deepfake_idx" ON "face_deepfake_logs" USING btree ("is_deepfake");--> statement-breakpoint
CREATE INDEX "fddl_created_idx" ON "face_deepfake_logs" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "fe_subject_idx" ON "face_enrollments" USING btree ("subject_id");--> statement-breakpoint
CREATE INDEX "fe_tenant_idx" ON "face_enrollments" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "fe_active_idx" ON "face_enrollments" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "fil_tenant_idx" ON "face_identify_logs" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "fil_identified_idx" ON "face_identify_logs" USING btree ("identified");--> statement-breakpoint
CREATE INDEX "fil_created_idx" ON "face_identify_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "fll_subject_idx" ON "face_liveness_logs" USING btree ("subject_id");--> statement-breakpoint
CREATE INDEX "fll_tenant_idx" ON "face_liveness_logs" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "fll_is_live_idx" ON "face_liveness_logs" USING btree ("is_live");--> statement-breakpoint
CREATE INDEX "fll_created_idx" ON "face_liveness_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "fpak_partner_idx" ON "face_partner_api_keys" USING btree ("partner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fpak_hash_idx" ON "face_partner_api_keys" USING btree ("key_hash");--> statement-breakpoint
CREATE INDEX "fpak_active_idx" ON "face_partner_api_keys" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "fpul_partner_idx" ON "face_partner_usage_logs" USING btree ("partner_id");--> statement-breakpoint
CREATE INDEX "fpul_key_idx" ON "face_partner_usage_logs" USING btree ("key_id");--> statement-breakpoint
CREATE INDEX "fpul_created_idx" ON "face_partner_usage_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "fp_status_idx" ON "face_partners" USING btree ("status");--> statement-breakpoint
CREATE INDEX "fpa_subject_idx" ON "face_payment_assertions" USING btree ("subject_id");--> statement-breakpoint
CREATE INDEX "fpa_partner_idx" ON "face_payment_assertions" USING btree ("partner_id");--> statement-breakpoint
CREATE INDEX "fpa_expires_idx" ON "face_payment_assertions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "fpa_revoked_idx" ON "face_payment_assertions" USING btree ("revoked");--> statement-breakpoint
CREATE INDEX "fvl_subject_idx" ON "face_verify_logs" USING btree ("subject_id");--> statement-breakpoint
CREATE INDEX "fvl_tenant_idx" ON "face_verify_logs" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "fvl_verified_idx" ON "face_verify_logs" USING btree ("verified");--> statement-breakpoint
CREATE INDEX "fvl_created_idx" ON "face_verify_logs" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "fvvl_request_idx" ON "face_video_verify_logs" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "fvvl_subject_idx" ON "face_video_verify_logs" USING btree ("subject_id");--> statement-breakpoint
CREATE INDEX "fvvl_tenant_idx" ON "face_video_verify_logs" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "fvvl_created_idx" ON "face_video_verify_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "feature_flags_key_idx" ON "feature_flags" USING btree ("key");--> statement-breakpoint
CREATE INDEX "feature_flags_enabled_idx" ON "feature_flags" USING btree ("enabled");--> statement-breakpoint
CREATE INDEX "feature_flags_tenant_idx" ON "feature_flags" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "fac_alert_idx" ON "fraud_alert_comments" USING btree ("alert_id");--> statement-breakpoint
CREATE INDEX "fac_merchant_idx" ON "fraud_alert_comments" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "fraud_alerts_tenant_idx" ON "fraud_alerts" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "fraud_alerts_merchant_idx" ON "fraud_alerts" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "fraud_alerts_status_idx" ON "fraud_alerts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "fraud_alerts_merchant_created_idx" ON "fraud_alerts" USING btree ("merchant_id","created_at");--> statement-breakpoint
CREATE INDEX "fraud_alerts_merchant_status_idx" ON "fraud_alerts" USING btree ("merchant_id","status");--> statement-breakpoint
CREATE INDEX "fraud_rule_merchant_idx" ON "fraud_rules" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "fraud_rule_status_idx" ON "fraud_rules" USING btree ("merchant_id","status");--> statement-breakpoint
CREATE INDEX "fx_alerts_merchant_idx" ON "fx_alerts" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "fx_alerts_active_idx" ON "fx_alerts" USING btree ("active");--> statement-breakpoint
CREATE INDEX "fx_rates_base_target_idx" ON "fx_rates" USING btree ("base_currency","target_currency");--> statement-breakpoint
CREATE INDEX "fx_rates_fetched_idx" ON "fx_rates" USING btree ("fetched_at");--> statement-breakpoint
CREATE INDEX "g2p_program_idx" ON "g2p_disbursement_batches" USING btree ("program_type");--> statement-breakpoint
CREATE INDEX "g2p_status_idx" ON "g2p_disbursement_batches" USING btree ("status");--> statement-breakpoint
CREATE INDEX "g2p_idv_tenant_idx" ON "g2p_identity_verifications" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "g2p_idv_beneficiary_idx" ON "g2p_identity_verifications" USING btree ("beneficiary_id");--> statement-breakpoint
CREATE INDEX "g2p_idv_txn_idx" ON "g2p_identity_verifications" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "geofence_merchant_idx" ON "geofence_rules" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "gnn_job_status_idx" ON "gnn_training_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "gnn_job_created_idx" ON "gnn_training_jobs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "gsp_merchant_idx" ON "gold_sip_plans" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "hc_status_idx" ON "healthcare_claims" USING btree ("status");--> statement-breakpoint
CREATE INDEX "hc_policy_idx" ON "healthcare_claims" USING btree ("policy_number");--> statement-breakpoint
CREATE INDEX "hc_provider_idx" ON "healthcare_claims" USING btree ("provider_id");--> statement-breakpoint
CREATE INDEX "help_search_query_idx" ON "help_search_analytics" USING btree ("query");--> statement-breakpoint
CREATE INDEX "help_search_user_type_idx" ON "help_search_analytics" USING btree ("user_type");--> statement-breakpoint
CREATE INDEX "help_search_created_idx" ON "help_search_analytics" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "idempotency_tenant_key_merchant_idx" ON "idempotency_requests" USING btree ("id","tenant_id","merchant_id");--> statement-breakpoint
CREATE INDEX "idempotency_operation_idx" ON "idempotency_requests" USING btree ("operation");--> statement-breakpoint
CREATE INDEX "idempotency_expires_idx" ON "idempotency_requests" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "ins_customer_idx" ON "insurance_policies" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "ins_status_idx" ON "insurance_policies" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ipp_policy_idx" ON "insurance_premium_payments" USING btree ("policy_id");--> statement-breakpoint
CREATE INDEX "ipp_status_idx" ON "insurance_premium_payments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ipp_due_date_idx" ON "insurance_premium_payments" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX "irt_merchant_idx" ON "intl_remittance_transfers" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "irt_tracking_idx" ON "intl_remittance_transfers" USING btree ("tracking_number");--> statement-breakpoint
CREATE INDEX "inv_audit_item_idx" ON "inventory_audit_log" USING btree ("item_id","merchant_id");--> statement-breakpoint
CREATE INDEX "inv_audit_created_idx" ON "inventory_audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "inventory_merchant_idx" ON "inventory_items" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "inv_res_item_merchant_idx" ON "inventory_reservations" USING btree ("item_id","merchant_id");--> statement-breakpoint
CREATE INDEX "inv_res_status_idx" ON "inventory_reservations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "inv_res_expires_idx" ON "inventory_reservations" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "inv_tx_item_idx" ON "inventory_transactions" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "invite_code_code_idx" ON "invite_codes" USING btree ("code");--> statement-breakpoint
CREATE INDEX "invite_code_type_idx" ON "invite_codes" USING btree ("type");--> statement-breakpoint
CREATE INDEX "invite_code_tenant_idx" ON "invite_codes" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "inv_fin_v2_merchant_idx" ON "invoice_financing_v2_applications" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "ip_invoice_idx" ON "invoice_payments" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "inv_merchant_idx" ON "invoices" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "inv_status_idx" ON "invoices" USING btree ("status");--> statement-breakpoint
CREATE INDEX "kds_merchant_idx" ON "kds_stations" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "keycloak_events_type_idx" ON "keycloak_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "keycloak_events_user_idx" ON "keycloak_events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "keycloak_events_received_idx" ON "keycloak_events" USING btree ("received_at");--> statement-breakpoint
CREATE INDEX "kyb_doc_verification_idx" ON "kyb_documents" USING btree ("verification_id");--> statement-breakpoint
CREATE INDEX "kyb_doc_merchant_idx" ON "kyb_documents" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "kyb_risk_verification_idx" ON "kyb_risk_scores" USING btree ("verification_id");--> statement-breakpoint
CREATE INDEX "kyb_risk_merchant_idx" ON "kyb_risk_scores" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "kyb_risk_band_idx" ON "kyb_risk_scores" USING btree ("risk_band");--> statement-breakpoint
CREATE INDEX "kybs_verification_idx" ON "kyb_steps" USING btree ("verification_id");--> statement-breakpoint
CREATE INDEX "kyb_merchant_idx" ON "kyb_verifications" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "kyb_status_idx" ON "kyb_verifications" USING btree ("status");--> statement-breakpoint
CREATE INDEX "kyb_expires_idx" ON "kyb_verifications" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "kyc_tenant_idx" ON "kyc_submissions" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "kyc_merchant_idx" ON "kyc_submissions" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "kyc_status_idx" ON "kyc_submissions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "kyc_liveness_idx" ON "kyc_submissions" USING btree ("liveness_score");--> statement-breakpoint
CREATE INDEX "kyc_bvn_status_idx" ON "kyc_submissions" USING btree ("bvn_verification_status");--> statement-breakpoint
CREATE INDEX "kyc_face_match_idx" ON "kyc_submissions" USING btree ("face_match_verified");--> statement-breakpoint
CREATE INDEX "kyc_duplicate_idx" ON "kyc_submissions" USING btree ("duplicate_flag");--> statement-breakpoint
CREATE INDEX "liveness_sessions_merchant_idx" ON "liveness_sessions" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "liveness_sessions_submission_idx" ON "liveness_sessions" USING btree ("submission_id");--> statement-breakpoint
CREATE INDEX "liveness_sessions_decision_idx" ON "liveness_sessions" USING btree ("decision");--> statement-breakpoint
CREATE INDEX "liveness_sessions_created_idx" ON "liveness_sessions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "liveness_sessions_retention_idx" ON "liveness_sessions" USING btree ("retention_expires_at");--> statement-breakpoint
CREATE INDEX "li_loan_idx" ON "loan_instalments" USING btree ("loan_id");--> statement-breakpoint
CREATE INDEX "li_merchant_idx" ON "loan_instalments" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "lr_loan_idx" ON "loan_repayments" USING btree ("loan_id");--> statement-breakpoint
CREATE INDEX "loyalty_account_merchant_idx" ON "loyalty_accounts" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "loyalty_account_customer_idx" ON "loyalty_accounts" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "loyalty_account_id_idx" ON "loyalty_accounts" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "loyalty_ledger_account_idx" ON "loyalty_ledger" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "loyalty_ledger_account_created_idx" ON "loyalty_ledger" USING btree ("account_id","created_at");--> statement-breakpoint
CREATE INDEX "loyalty_tx_account_idx" ON "loyalty_transactions" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "loyalty_v3_member_merchant_idx" ON "loyalty_v3_members" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "loyalty_v3_merchant_idx" ON "loyalty_v3_programs" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "loyalty_v3_redemption_program_idx" ON "loyalty_v3_redemptions" USING btree ("program_id");--> statement-breakpoint
CREATE INDEX "loyalty_v3_redemption_member_idx" ON "loyalty_v3_redemptions" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "loyalty_v3_redemption_merchant_idx" ON "loyalty_v3_redemptions" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "mp_order_merchant_idx" ON "marketplace_orders" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "menu_cat_merchant_idx" ON "menu_categories" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "menu_item_cat_idx" ON "menu_items" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "menu_item_merchant_idx" ON "menu_items" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "md_merchant_idx" ON "merchant_directors" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "ml_merchant_idx" ON "merchant_loans" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "ml_status_idx" ON "merchant_loans" USING btree ("status");--> statement-breakpoint
CREATE INDEX "notif_merchant_idx" ON "merchant_notifications" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "notif_merchant_read_idx" ON "merchant_notifications" USING btree ("merchant_id","is_read");--> statement-breakpoint
CREATE INDEX "notif_created_idx" ON "merchant_notifications" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "notif_priority_idx" ON "merchant_notifications" USING btree ("merchant_id","priority");--> statement-breakpoint
CREATE INDEX "mp_merchant_idx" ON "merchant_profiles" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "merchant_risk_merchant_idx" ON "merchant_risk_scores" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "merchant_risk_level_idx" ON "merchant_risk_scores" USING btree ("risk_level");--> statement-breakpoint
CREATE INDEX "msw_merchant_idx" ON "merchant_solana_wallets" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "msw_address_idx" ON "merchant_solana_wallets" USING btree ("wallet_address");--> statement-breakpoint
CREATE INDEX "merchant_status_log_merchant_idx" ON "merchant_status_log" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "merchant_status_log_action_idx" ON "merchant_status_log" USING btree ("action");--> statement-breakpoint
CREATE INDEX "merchant_status_log_created_idx" ON "merchant_status_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "merchants_tenant_idx" ON "merchants" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "merchants_owner_idx" ON "merchants" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "mm_recon_tenant_idx" ON "mobile_money_recon" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "mm_recon_merchant_idx" ON "mobile_money_recon" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "mm_recon_status_idx" ON "mobile_money_recon" USING btree ("status");--> statement-breakpoint
CREATE INDEX "mr_requester_idx" ON "money_requests" USING btree ("requester_id");--> statement-breakpoint
CREATE INDEX "mr_status_idx" ON "money_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "mosip_cred_tenant_idx" ON "mosip_credential_requests" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "mosip_cred_request_idx" ON "mosip_credential_requests" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "mosip_cred_status_idx" ON "mosip_credential_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "mosip_ekyc_tenant_idx" ON "mosip_ekyc_submissions" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "mosip_ekyc_individual_idx" ON "mosip_ekyc_submissions" USING btree ("individual_id");--> statement-breakpoint
CREATE INDEX "mosip_ekyc_txn_idx" ON "mosip_ekyc_submissions" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "mosip_otp_tenant_idx" ON "mosip_otp_log" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "mosip_otp_txn_idx" ON "mosip_otp_log" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "mosip_pkt_tenant_idx" ON "mosip_registration_packets" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "mosip_pkt_rid_idx" ON "mosip_registration_packets" USING btree ("registration_id");--> statement-breakpoint
CREATE INDEX "mosip_pkt_status_idx" ON "mosip_registration_packets" USING btree ("status_code");--> statement-breakpoint
CREATE INDEX "mosip_reg_tenant_idx" ON "mosip_registrations" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "mosip_reg_prereg_idx" ON "mosip_registrations" USING btree ("pre_registration_id");--> statement-breakpoint
CREATE INDEX "mosip_reg_status_idx" ON "mosip_registrations" USING btree ("status_code");--> statement-breakpoint
CREATE INDEX "mosip_uin_tenant_idx" ON "mosip_uin_records" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "mosip_uin_hash_idx" ON "mosip_uin_records" USING btree ("uin_hash");--> statement-breakpoint
CREATE INDEX "mosip_uin_status_idx" ON "mosip_uin_records" USING btree ("status");--> statement-breakpoint
CREATE INDEX "mosip_vid_tenant_idx" ON "mosip_vid_records" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "mosip_vid_uin_hash_idx" ON "mosip_vid_records" USING btree ("uin_hash");--> statement-breakpoint
CREATE INDEX "mosip_vid_status_idx" ON "mosip_vid_records" USING btree ("status");--> statement-breakpoint
CREATE INDEX "mcl_merchant_idx" ON "multi_currency_ledger_accounts" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "mcl_entry_merchant_idx" ON "multi_currency_ledger_entries" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "mfh_merchant_idx" ON "mutual_fund_holdings" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "mfh_fund_idx" ON "mutual_fund_holdings" USING btree ("fund_id");--> statement-breakpoint
CREATE INDEX "mft_merchant_idx" ON "mutual_fund_transactions" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "network_quality_merchant_idx" ON "network_quality_events" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "network_quality_created_idx" ON "network_quality_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "nbt_state_idx" ON "nexthub_bulk_transfers" USING btree ("state");--> statement-breakpoint
CREATE INDEX "nbt_payer_idx" ON "nexthub_bulk_transfers" USING btree ("payer_fsp");--> statement-breakpoint
CREATE INDEX "nbt_created_idx" ON "nexthub_bulk_transfers" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "nfr_pair_idx" ON "nexthub_fx_rates" USING btree ("source_currency","target_currency");--> statement-breakpoint
CREATE INDEX "nfr_valid_idx" ON "nexthub_fx_rates" USING btree ("valid_from","valid_to");--> statement-breakpoint
CREATE INDEX "no_party_id_type_idx" ON "nexthub_oracles" USING btree ("party_id_type");--> statement-breakpoint
CREATE INDEX "no_active_idx" ON "nexthub_oracles" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "npc_consumer_idx" ON "nexthub_pisp_consents" USING btree ("consumer_id");--> statement-breakpoint
CREATE INDEX "npc_pisp_idx" ON "nexthub_pisp_consents" USING btree ("pisp_id");--> statement-breakpoint
CREATE INDEX "npc_state_idx" ON "nexthub_pisp_consents" USING btree ("state");--> statement-breakpoint
CREATE INDEX "nfc_device_merchant_idx" ON "nfc_devices" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "nfc_tx_merchant_idx" ON "nfc_transactions" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "nb_recipient_idx" ON "nft_badges" USING btree ("recipient_id");--> statement-breakpoint
CREATE INDEX "nb_status_idx" ON "nft_badges" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "ninauth_session_state_idx" ON "ninauth_consent_sessions" USING btree ("state");--> statement-breakpoint
CREATE INDEX "ninauth_session_user_idx" ON "ninauth_consent_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ninauth_identity_nin_hash_idx" ON "ninauth_verified_identities" USING btree ("nin_hash");--> statement-breakpoint
CREATE INDEX "ninauth_identity_user_idx" ON "ninauth_verified_identities" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "nin_face_match_partner_idx" ON "nin_face_match_logs" USING btree ("partner_id","requested_at");--> statement-breakpoint
CREATE INDEX "nin_face_match_context_idx" ON "nin_face_match_logs" USING btree ("context");--> statement-breakpoint
CREATE INDEX "nin_vc_id_idx" ON "nin_vc_verification_logs" USING btree ("vc_id");--> statement-breakpoint
CREATE INDEX "nin_vc_subject_idx" ON "nin_vc_verification_logs" USING btree ("subject_nin_hash");--> statement-breakpoint
CREATE INDEX "nin_verify_partner_idx" ON "nin_verification_logs" USING btree ("partner_id","requested_at");--> statement-breakpoint
CREATE UNIQUE INDEX "nip_account_cache_key_idx" ON "nip_account_cache" USING btree ("tenant_id","bank_code","account_number");--> statement-breakpoint
CREATE INDEX "nip_account_cache_expires_idx" ON "nip_account_cache" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "nip_banks_code_idx" ON "nip_banks" USING btree ("bank_code");--> statement-breakpoint
CREATE INDEX "nip_banks_active_idx" ON "nip_banks" USING btree ("is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "nip_name_enquiry_cache_key_idx" ON "nip_name_enquiry_cache" USING btree ("bank_nip_code","account_number");--> statement-breakpoint
CREATE INDEX "nip_name_enquiry_cache_expires_idx" ON "nip_name_enquiry_cache" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "nip_errors_tenant_idx" ON "nip_resolution_errors" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "nip_errors_merchant_idx" ON "nip_resolution_errors" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "nip_errors_bank_account_idx" ON "nip_resolution_errors" USING btree ("bank_code","account_number");--> statement-breakpoint
CREATE INDEX "nip_errors_created_idx" ON "nip_resolution_errors" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "nip_va_merchant_idx" ON "nip_virtual_accounts" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "nip_va_reference_idx" ON "nip_virtual_accounts" USING btree ("reference");--> statement-breakpoint
CREATE INDEX "nip_va_status_idx" ON "nip_virtual_accounts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "nip_va_expires_idx" ON "nip_virtual_accounts" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "na_merchant_idx" ON "nodal_accounts" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "nt_account_idx" ON "nodal_transactions" USING btree ("nodal_account_id");--> statement-breakpoint
CREATE INDEX "offline_queue_merchant_idx" ON "offline_queue" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "offline_queue_status_idx" ON "offline_queue" USING btree ("status");--> statement-breakpoint
CREATE INDEX "offline_queue_priority_idx" ON "offline_queue" USING btree ("priority");--> statement-breakpoint
CREATE INDEX "offline_queue_next_retry_idx" ON "offline_queue" USING btree ("next_retry_at");--> statement-breakpoint
CREATE INDEX "offline_queue_created_idx" ON "offline_queue" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "ob_v2_acc_merchant_idx" ON "open_banking_accounts_v2" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "ob_v2_merchant_idx" ON "open_banking_consents_v2" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "overhead_tenant_idx" ON "overhead_costs" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "overhead_period_idx" ON "overhead_costs" USING btree ("tenant_id","period_start","period_end");--> statement-breakpoint
CREATE INDEX "overhead_category_idx" ON "overhead_costs" USING btree ("tenant_id","category");--> statement-breakpoint
CREATE INDEX "p2p_sender_idx" ON "p2p_transfers" USING btree ("sender_id");--> statement-breakpoint
CREATE INDEX "p2p_status_idx" ON "p2p_transfers" USING btree ("status");--> statement-breakpoint
CREATE INDEX "p2p_created_idx" ON "p2p_transfers" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "partner_onboard_user_idx" ON "partner_onboarding_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "partner_onboard_step_idx" ON "partner_onboarding_sessions" USING btree ("current_step");--> statement-breakpoint
CREATE INDEX "payment_links_tenant_idx" ON "payment_links" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "payment_links_merchant_idx" ON "payment_links" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "payouts_tenant_idx" ON "payouts" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "payouts_merchant_idx" ON "payouts" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "payouts_merchant_created_idx" ON "payouts" USING btree ("merchant_id","created_at");--> statement-breakpoint
CREATE INDEX "payouts_merchant_status_idx" ON "payouts" USING btree ("merchant_id","status");--> statement-breakpoint
CREATE INDEX "payroll_merchant_idx" ON "payroll_runs" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "payroll_v3_emp_merchant_idx" ON "payroll_v3_employees" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "payroll_v3_merchant_idx" ON "payroll_v3_runs" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "pa_merchant_idx" ON "pension_accounts" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "pc_account_idx" ON "pension_contributions" USING btree ("pension_account_id");--> statement-breakpoint
CREATE INDEX "psub_merchant_idx" ON "portal_subscriptions" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "rebalance_user_idx" ON "portfolio_rebalancing_orders" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "rebalance_status_idx" ON "portfolio_rebalancing_orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "pos_products_merchant_idx" ON "pos_products" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "pos_products_sku_merchant_idx" ON "pos_products" USING btree ("sku","merchant_id");--> statement-breakpoint
CREATE INDEX "pos_products_category_idx" ON "pos_products" USING btree ("category");--> statement-breakpoint
CREATE INDEX "pos_products_barcode_idx" ON "pos_products" USING btree ("barcode");--> statement-breakpoint
CREATE INDEX "pos_merchant_idx" ON "pos_terminals" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "pos_status_idx" ON "pos_terminals" USING btree ("status");--> statement-breakpoint
CREATE INDEX "pos_serial_idx" ON "pos_terminals" USING btree ("serial_number");--> statement-breakpoint
CREATE INDEX "pos_tx_terminal_idx" ON "pos_transactions" USING btree ("terminal_id");--> statement-breakpoint
CREATE INDEX "pos_tx_merchant_idx" ON "pos_transactions" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "pal_merchant_idx" ON "privacy_aliases" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "ps_merchant_idx" ON "privacy_settings" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "ptsp_batch_merchant_idx" ON "ptsp_batches" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "ptsp_batch_date_idx" ON "ptsp_batches" USING btree ("settlement_date");--> statement-breakpoint
CREATE INDEX "ptsp_batch_status_idx" ON "ptsp_batches" USING btree ("status");--> statement-breakpoint
CREATE INDEX "po_merchant_idx" ON "purchase_orders" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "po_status_idx" ON "purchase_orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "qr_merchant_idx" ON "qr_payments" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "qr_status_idx" ON "qr_payments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "rate_limit_identifier_idx" ON "rate_limit_events" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "rate_limit_blocked_idx" ON "rate_limit_events" USING btree ("blocked");--> statement-breakpoint
CREATE INDEX "rate_limit_created_idx" ON "rate_limit_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "rtn_hist_merchant_idx" ON "realtime_notification_history" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "rtn_pref_merchant_idx" ON "realtime_notification_preferences" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "recipe_menu_item_idx" ON "recipe_ingredients" USING btree ("menu_item_id");--> statement-breakpoint
CREATE INDEX "recon_alert_merchant_idx" ON "reconciliation_alerts" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "recon_alert_status_idx" ON "reconciliation_alerts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "recon_alert_created_idx" ON "reconciliation_alerts" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "rec_envelope_idx" ON "red_envelope_claims" USING btree ("envelope_id");--> statement-breakpoint
CREATE INDEX "rec_claimant_idx" ON "red_envelope_claims" USING btree ("claimant_id");--> statement-breakpoint
CREATE INDEX "re_sender_idx" ON "red_envelopes" USING btree ("sender_id");--> statement-breakpoint
CREATE INDEX "re_status_idx" ON "red_envelopes" USING btree ("status");--> statement-breakpoint
CREATE INDEX "referrals_referrer_idx" ON "referrals" USING btree ("referrer_id");--> statement-breakpoint
CREATE INDEX "referrals_code_idx" ON "referrals" USING btree ("referral_code");--> statement-breakpoint
CREATE INDEX "referrals_status_idx" ON "referrals" USING btree ("status");--> statement-breakpoint
CREATE INDEX "reg_report_merchant_idx" ON "regulatory_reports" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "rsc_merchant_idx" ON "regulatory_sandbox_configs" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "rc_from_to_idx" ON "remittance_corridors" USING btree ("from_currency","to_currency");--> statement-breakpoint
CREATE INDEX "rc_active_idx" ON "remittance_corridors" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "rt_status_idx" ON "remittance_transfers" USING btree ("status");--> statement-breakpoint
CREATE INDEX "rt_corridor_idx" ON "remittance_transfers" USING btree ("corridor_id");--> statement-breakpoint
CREATE INDEX "rj_merchant_idx" ON "report_jobs" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "rj_status_idx" ON "report_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "order_item_order_idx" ON "restaurant_order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "restaurant_order_merchant_idx" ON "restaurant_orders" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "restaurant_order_table_idx" ON "restaurant_orders" USING btree ("table_id");--> statement-breakpoint
CREATE INDEX "restaurant_table_merchant_idx" ON "restaurant_tables" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "rpc_merchant_idx" ON "retail_pos_configs" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "rs_merchant_idx" ON "retail_sales" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "rs_created_idx" ON "retail_sales" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "retry_policies_merchant_idx" ON "retry_policies" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "retry_policies_op_idx" ON "retry_policies" USING btree ("operation_type");--> statement-breakpoint
CREATE INDEX "sa_merchant_idx" ON "salary_accounts" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "sa_employee_idx" ON "salary_accounts" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "st_account_idx" ON "salary_transactions" USING btree ("salary_account_id");--> statement-breakpoint
CREATE INDEX "sb_user_idx" ON "saved_beneficiaries" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "scf_status_idx" ON "scf_invoices" USING btree ("status");--> statement-breakpoint
CREATE INDEX "scf_supplier_idx" ON "scf_invoices" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "scf_buyer_idx" ON "scf_invoices" USING btree ("buyer_id");--> statement-breakpoint
CREATE INDEX "sr_merchant_idx" ON "scheduled_reports" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "scuml_merchant_idx" ON "scuml_checks" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "scuml_status_idx" ON "scuml_checks" USING btree ("status");--> statement-breakpoint
CREATE INDEX "scuml_expires_idx" ON "scuml_checks" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "st_merchant_idx" ON "sdk_tokens" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "st_hash_idx" ON "sdk_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sla_settlement_idx" ON "settlement_sla_events" USING btree ("settlement_id");--> statement-breakpoint
CREATE INDEX "sla_merchant_idx" ON "settlement_sla_events" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "sla_status_idx" ON "settlement_sla_events" USING btree ("status");--> statement-breakpoint
CREATE INDEX "sla_breached_idx" ON "settlement_sla_events" USING btree ("sla_breached");--> statement-breakpoint
CREATE INDEX "settlements_tenant_idx" ON "settlements" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "settlements_merchant_idx" ON "settlements" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "settlements_status_idx" ON "settlements" USING btree ("status");--> statement-breakpoint
CREATE INDEX "settlements_sla_deadline_idx" ON "settlements" USING btree ("sla_deadline_at");--> statement-breakpoint
CREATE INDEX "settlements_reference_idx" ON "settlements" USING btree ("reference");--> statement-breakpoint
CREATE INDEX "sd_merchant_idx" ON "soundbox_devices" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "split_bill_order_idx" ON "split_bill_sessions" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "split_share_session_idx" ON "split_bill_shares" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "sp_rule_idx" ON "split_payments" USING btree ("split_rule_id");--> statement-breakpoint
CREATE INDEX "sp_status_idx" ON "split_payments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "sr_active_idx" ON "split_rules" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "staff_merchant_idx" ON "staff_members" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "shift_staff_idx" ON "staff_shifts" USING btree ("staff_id");--> statement-breakpoint
CREATE INDEX "shift_merchant_idx" ON "staff_shifts" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "stripe_sub_user_idx" ON "stripe_subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "stripe_sub_stripe_id_idx" ON "stripe_subscriptions" USING btree ("stripe_subscription_id");--> statement-breakpoint
CREATE INDEX "stripe_sub_status_idx" ON "stripe_subscriptions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "sub_charges_sub_idx" ON "subscription_charges" USING btree ("subscription_id");--> statement-breakpoint
CREATE INDEX "sub_charges_merchant_idx" ON "subscription_charges" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "spv2_merchant_idx" ON "subscription_plans_v2" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "ss_plan_idx" ON "subscription_subscribers" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "ss_merchant_idx" ON "subscription_subscribers" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "subscriptions_merchant_idx" ON "subscriptions" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "subscriptions_status_idx" ON "subscriptions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "subscriptions_next_run_idx" ON "subscriptions" USING btree ("next_run_at");--> statement-breakpoint
CREATE INDEX "sa_v2_merchant_idx" ON "super_agent_v2_networks" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "support_session_idx" ON "support_messages" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "support_merchant_idx" ON "support_messages" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "support_user_idx" ON "support_messages" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "support_created_idx" ON "support_messages" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "tax_filing_merchant_idx" ON "tax_filing_records" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "twr_merchant_idx" ON "tax_withholding_records" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "twr_period_idx" ON "tax_withholding_records" USING btree ("period");--> statement-breakpoint
CREATE INDEX "team_members_tenant_idx" ON "team_members" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "team_members_merchant_idx" ON "team_members" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "temporal_submission_idx" ON "temporal_consistency_checks" USING btree ("submission_id");--> statement-breakpoint
CREATE INDEX "temporal_merchant_idx" ON "temporal_consistency_checks" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "temporal_check_type_idx" ON "temporal_consistency_checks" USING btree ("check_type");--> statement-breakpoint
CREATE INDEX "tenant_invoice_tenant_idx" ON "tenant_billing_invoices" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "tenant_invoice_status_idx" ON "tenant_billing_invoices" USING btree ("status");--> statement-breakpoint
CREATE INDEX "tenant_invoice_period_idx" ON "tenant_billing_invoices" USING btree ("period");--> statement-breakpoint
CREATE INDEX "corridor_daily_tenant_idx" ON "tenant_corridor_daily_stats" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "corridor_daily_date_idx" ON "tenant_corridor_daily_stats" USING btree ("date");--> statement-breakpoint
CREATE INDEX "corridor_daily_corridor_idx" ON "tenant_corridor_daily_stats" USING btree ("corridor_id");--> statement-breakpoint
CREATE INDEX "tenant_corridor_tenant_idx" ON "tenant_corridors" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "tenant_corridor_currencies_idx" ON "tenant_corridors" USING btree ("source_currency","dest_currency");--> statement-breakpoint
CREATE INDEX "tenant_fee_tenant_idx" ON "tenant_fee_overrides" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "tenant_fee_type_idx" ON "tenant_fee_overrides" USING btree ("transaction_type");--> statement-breakpoint
CREATE INDEX "tenant_plan_limits_plan_idx" ON "tenant_plan_limits" USING btree ("plan");--> statement-breakpoint
CREATE INDEX "tenant_sso_tenant_idx" ON "tenant_sso_configs" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "tenant_usage_tenant_period_idx" ON "tenant_usage_metrics" USING btree ("tenant_id","period");--> statement-breakpoint
CREATE INDEX "receipts_txn_idx" ON "transaction_receipts" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "receipts_user_idx" ON "transaction_receipts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "receipts_number_idx" ON "transaction_receipts" USING btree ("receipt_number");--> statement-breakpoint
CREATE INDEX "transactions_tenant_idx" ON "transactions" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "transactions_merchant_idx" ON "transactions" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "transactions_status_idx" ON "transactions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "transactions_created_idx" ON "transactions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "transactions_merchant_created_idx" ON "transactions" USING btree ("merchant_id","created_at");--> statement-breakpoint
CREATE INDEX "transactions_merchant_status_idx" ON "transactions" USING btree ("merchant_id","status");--> statement-breakpoint
CREATE INDEX "ubo_verification_idx" ON "ubo_owners" USING btree ("verification_id");--> statement-breakpoint
CREATE INDEX "ubo_merchant_idx" ON "ubo_owners" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "ud_wallet_idx" ON "usdc_deposits" USING btree ("wallet_address");--> statement-breakpoint
CREATE INDEX "ud_merchant_idx" ON "usdc_deposits" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "ud_signature_idx" ON "usdc_deposits" USING btree ("solana_signature");--> statement-breakpoint
CREATE INDEX "up_merchant_idx" ON "usdc_payouts" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "up_status_idx" ON "usdc_payouts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "up_signature_idx" ON "usdc_payouts" USING btree ("solana_signature");--> statement-breakpoint
CREATE INDEX "up_workflow_idx" ON "usdc_payouts" USING btree ("temporal_workflow_id");--> statement-breakpoint
CREATE INDEX "usdc_v2_tx_merchant_idx" ON "usdc_v2_transactions" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "usdc_v2_wallet_merchant_idx" ON "usdc_v2_wallets" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "uic_policy_idx" ON "user_insurance_claims" USING btree ("policy_id");--> statement-breakpoint
CREATE INDEX "uic_user_idx" ON "user_insurance_claims" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "locale_user_idx" ON "user_locale_preferences" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "users_tenant_idx" ON "users" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "ussd_merchant_idx" ON "ussd_sessions" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "ussd_session_id_idx" ON "ussd_sessions" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "ussd_msisdn_idx" ON "ussd_sessions" USING btree ("msisdn");--> statement-breakpoint
CREATE INDEX "vb_merchant_idx" ON "velocity_breaches" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "vb_breached_at_idx" ON "velocity_breaches" USING btree ("breached_at");--> statement-breakpoint
CREATE INDEX "vlc_merchant_channel_idx" ON "velocity_limit_configs" USING btree ("merchant_id","channel");--> statement-breakpoint
CREATE INDEX "vlc_active_idx" ON "velocity_limit_configs" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "vc_tenant_idx" ON "verifiable_credentials" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "vc_individual_idx" ON "verifiable_credentials" USING btree ("individual_id");--> statement-breakpoint
CREATE INDEX "vc_status_idx" ON "verifiable_credentials" USING btree ("status");--> statement-breakpoint
CREATE INDEX "virtual_cards_tenant_idx" ON "virtual_cards" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "virtual_cards_merchant_idx" ON "virtual_cards" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "wallet_tx_tenant_idx" ON "wallet_transactions" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "wallet_tx_wallet_idx" ON "wallet_transactions" USING btree ("wallet_id");--> statement-breakpoint
CREATE INDEX "wallet_tx_created_idx" ON "wallet_transactions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "wallets_tenant_idx" ON "wallets" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "wallets_user_idx" ON "wallets" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "wallets_merchant_idx" ON "wallets" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "wg_merchant_idx" ON "wealth_goals" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "wrp_merchant_idx" ON "wealth_risk_profiles" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "webhook_deliveries_tenant_idx" ON "webhook_deliveries" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "webhook_deliveries_webhook_idx" ON "webhook_deliveries" USING btree ("webhook_id");--> statement-breakpoint
CREATE INDEX "webhook_deliveries_merchant_idx" ON "webhook_deliveries" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "wdl_endpoint_idx" ON "webhook_delivery_log" USING btree ("endpoint_id");--> statement-breakpoint
CREATE INDEX "wdl_merchant_idx" ON "webhook_delivery_log" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "we_merchant_idx" ON "webhook_endpoints" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "we_active_idx" ON "webhook_endpoints" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "webhook_sim_merchant_idx" ON "webhook_simulator_logs" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "webhook_sim_event_type_idx" ON "webhook_simulator_logs" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "webhook_sim_created_idx" ON "webhook_simulator_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "webhooks_tenant_idx" ON "webhooks" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "webhooks_merchant_idx" ON "webhooks" USING btree ("merchant_id");