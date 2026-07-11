/**
 * performance_indexes.ts — Comprehensive Database Performance Indexes
 * ─────────────────────────────────────────────────────────────────────────────
 * This file augments the existing schema tables with all missing indexes.
 * It is imported by db.ts to ensure indexes are created on startup via
 * the `CREATE INDEX IF NOT EXISTS` migration helper.
 *
 * Index strategy:
 *   1. Single-column indexes on all FK and status/state columns
 *   2. Composite indexes on the most common query patterns
 *   3. Partial indexes on hot-path filtered queries (e.g. status = 'OPEN')
 *   4. Covering indexes for SELECT-heavy read paths
 *
 * All indexes use IF NOT EXISTS so they are safe to apply repeatedly.
 */

// ─── Raw SQL Index Definitions ────────────────────────────────────────────────
// These are applied via rawQuery() in db.ts on startup.

export const PERFORMANCE_INDEXES: string[] = [

  // ── nexthub_transfers (zero indexes in schema — highest priority) ────────────
  // Transfer state is queried on every settlement window close
  `CREATE INDEX IF NOT EXISTS idx_nexthub_transfers_state
     ON nexthub_transfers (state)`,

  // Payer FSP + state: most common query pattern in settlement netting
  `CREATE INDEX IF NOT EXISTS idx_nexthub_transfers_payer_state
     ON nexthub_transfers (payer_fsp_id, state)`,

  // Payee FSP + state: symmetric to payer
  `CREATE INDEX IF NOT EXISTS idx_nexthub_transfers_payee_state
     ON nexthub_transfers (payee_fsp_id, state)`,

  // Window ID: used in settlement close to aggregate all transfers in a window
  `CREATE INDEX IF NOT EXISTS idx_nexthub_transfers_window_id
     ON nexthub_transfers (window_id)`,

  // Composite: window + state — covers the settlement netting query exactly
  `CREATE INDEX IF NOT EXISTS idx_nexthub_transfers_window_state
     ON nexthub_transfers (window_id, state)`,

  // Created at: used for time-range queries and pagination
  `CREATE INDEX IF NOT EXISTS idx_nexthub_transfers_created_at
     ON nexthub_transfers (created_at DESC)`,

  // Partial index: only COMMITTED transfers (hot path for settlement)
  `CREATE INDEX IF NOT EXISTS idx_nexthub_transfers_committed
     ON nexthub_transfers (window_id, payer_fsp_id, payee_fsp_id, amount_kobo)
     WHERE state = 'COMMITTED'`,

  // Fraud score: used for AML dashboard queries
  `CREATE INDEX IF NOT EXISTS idx_nexthub_transfers_fraud_score
     ON nexthub_transfers (fraud_score DESC)
     WHERE fraud_score IS NOT NULL`,

  // ── transfer_disputes (zero indexes in schema) ───────────────────────────────
  // Status: SLA escalation background job queries OPEN disputes
  `CREATE INDEX IF NOT EXISTS idx_transfer_disputes_status
     ON transfer_disputes (status)`,

  // SLA deadline: background job scans for overdue open disputes
  `CREATE INDEX IF NOT EXISTS idx_transfer_disputes_sla_deadline
     ON transfer_disputes (sla_deadline)
     WHERE status = 'OPEN'`,

  // Transfer ID: dispute lookup by transfer
  `CREATE INDEX IF NOT EXISTS idx_transfer_disputes_transfer_id
     ON transfer_disputes (transfer_id)`,

  // Initiating DFSP + status: DFSP dashboard queries
  `CREATE INDEX IF NOT EXISTS idx_transfer_disputes_dfsp_status
     ON transfer_disputes (initiated_by_dfsp_id, status)`,

  // Created at: pagination
  `CREATE INDEX IF NOT EXISTS idx_transfer_disputes_created_at
     ON transfer_disputes (created_at DESC)`,

  // ── settlement_net_positions ─────────────────────────────────────────────────
  // Composite: window + DFSP — covers the settlement close query
  `CREATE INDEX IF NOT EXISTS idx_settlement_net_positions_window_dfsp
     ON settlement_net_positions (window_id, dfsp_id)`,

  // Window ID alone: list all positions for a window
  `CREATE INDEX IF NOT EXISTS idx_settlement_net_positions_window
     ON settlement_net_positions (window_id)`,

  // ── nexthub_security_events ──────────────────────────────────────────────────
  // Unacknowledged events: security dashboard hot path
  `CREATE INDEX IF NOT EXISTS idx_security_events_unacked
     ON nexthub_security_events (created_at DESC)
     WHERE acknowledged = false`,

  // Severity + acknowledged: filtered dashboard queries
  `CREATE INDEX IF NOT EXISTS idx_security_events_severity
     ON nexthub_security_events (severity, acknowledged, created_at DESC)`,

  // ── aml_rules ────────────────────────────────────────────────────────────────
  // Enabled rules: AML screening only queries enabled rules
  `CREATE INDEX IF NOT EXISTS idx_aml_rules_enabled
     ON aml_rules (rule_category, is_enabled)
     WHERE is_enabled = true`,

  // ── nexthub_dfsps ────────────────────────────────────────────────────────────
  // Status: participant list queries filter by status
  `CREATE INDEX IF NOT EXISTS idx_nexthub_dfsps_status
     ON nexthub_dfsps (status)`,

  // Country + status: multi-region participant queries
  `CREATE INDEX IF NOT EXISTS idx_nexthub_dfsps_country_status
     ON nexthub_dfsps (country, status)`,

  // ── nexthub_invoices ─────────────────────────────────────────────────────────
  // Status + due_at: billing overdue detection background job
  `CREATE INDEX IF NOT EXISTS idx_nexthub_invoices_status_due
     ON nexthub_invoices (status, due_at)
     WHERE status IN ('ISSUED', 'OVERDUE')`,

  // DFSP ID: invoice list per DFSP
  `CREATE INDEX IF NOT EXISTS idx_nexthub_invoices_dfsp
     ON nexthub_invoices (dfsp_id, status)`,

  // ── nexthub_pisp_consents ────────────────────────────────────────────────────
  // Active consents with expiry: consent expiry sweep
  `CREATE INDEX IF NOT EXISTS idx_pisp_consents_active_expiry
     ON nexthub_pisp_consents (expires_at)
     WHERE state = 'ACTIVE'`,

  // Consumer + state: consent lookup for a consumer
  `CREATE INDEX IF NOT EXISTS idx_pisp_consents_consumer_state
     ON nexthub_pisp_consents (consumer_id, state)`,

  // ── nexthub_fx_rates ─────────────────────────────────────────────────────────
  // Currency pair + validity: FX rate lookup (most frequent query)
  `CREATE INDEX IF NOT EXISTS idx_fx_rates_pair_valid
     ON nexthub_fx_rates (source_currency, target_currency, valid_from DESC)
     WHERE valid_to IS NULL OR valid_to > NOW()`,

  // ── nqr_transactions ─────────────────────────────────────────────────────────
  // Pending + expires: NQR expiry sweep
  `CREATE INDEX IF NOT EXISTS idx_nqr_pending_expires
     ON nqr_transactions (expires_at)
     WHERE status = 'PENDING'`,

  // Merchant + status: merchant dashboard
  `CREATE INDEX IF NOT EXISTS idx_nqr_merchant_status
     ON nqr_transactions (merchant_id, status, created_at DESC)`,

  // ── audit_logs ────────────────────────────────────────────────────────────────
  // Entity type + entity ID: audit trail lookup
  `CREATE INDEX IF NOT EXISTS idx_audit_logs_entity
     ON audit_logs (entity_type, entity_id, created_at DESC)`,

  // User ID: user activity audit
  `CREATE INDEX IF NOT EXISTS idx_audit_logs_user
     ON audit_logs (user_id, created_at DESC)`,

  // ── dfsp_onboarding_sessions ─────────────────────────────────────────────────
  // Status: onboarding dashboard
  `CREATE INDEX IF NOT EXISTS idx_dfsp_onboarding_status
     ON dfsp_onboarding_sessions (status, created_at DESC)`,

  // ── nexthub_participant_positions ────────────────────────────────────────────
  // DFSP + currency: position lookup
  `CREATE INDEX IF NOT EXISTS idx_participant_positions_dfsp_currency
     ON nexthub_participant_positions (dfsp_id, currency)`,

  // ── nexthub_bulk_transfers ───────────────────────────────────────────────────
  // State + created_at: bulk transfer dashboard
  `CREATE INDEX IF NOT EXISTS idx_bulk_transfers_state_created
     ON nexthub_bulk_transfers (state, created_at DESC)`,

  // Submitted by: user's bulk transfers
  `CREATE INDEX IF NOT EXISTS idx_bulk_transfers_submitted_by
     ON nexthub_bulk_transfers (submitted_by, created_at DESC)`,
];
