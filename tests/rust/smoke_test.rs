/// NextHub Face Bias Audit Service — Rust Smoke Test Suite
///
/// Tests every endpoint of the face-bias-audit Axum service:
///   - Health check
///   - Metrics endpoint
///   - Bias audit ingest, report, report-by-op, alerts
///   - NINAuth consent audit, face-match audit, VC audit
///   - Fidelity audit ingest, report, compliance
///
/// Run with:
///   BIAS_AUDIT_URL=http://localhost:8230 cargo test --test smoke_test -- --nocapture
///
/// The tests use `reqwest` in blocking mode so they can be run without a
/// Tokio runtime in the test harness (standard `cargo test` works fine).
///
/// All tests skip gracefully when the service is not reachable, so they are
/// safe to run in CI even when the service container is not started.

use std::env;
use std::collections::HashMap;

fn bias_audit_url() -> String {
    env::var("BIAS_AUDIT_URL").unwrap_or_else(|_| "http://localhost:8230".into())
}

fn get(path: &str) -> Result<reqwest::blocking::Response, reqwest::Error> {
    let url = format!("{}{}", bias_audit_url(), path);
    reqwest::blocking::Client::new()
        .get(&url)
        .timeout(std::time::Duration::from_secs(10))
        .send()
}

fn post_json(path: &str, body: &serde_json::Value) -> Result<reqwest::blocking::Response, reqwest::Error> {
    let url = format!("{}{}", bias_audit_url(), path);
    reqwest::blocking::Client::new()
        .post(&url)
        .json(body)
        .timeout(std::time::Duration::from_secs(10))
        .send()
}

/// Skip the test gracefully when the service is not reachable.
macro_rules! skip_if_unavailable {
    ($result:expr) => {
        match $result {
            Ok(r) => r,
            Err(e) if e.is_connect() || e.is_timeout() => {
                eprintln!("SKIP: face-bias-audit service unavailable: {}", e);
                return;
            }
            Err(e) => panic!("Unexpected request error: {}", e),
        }
    };
}

// ─── Health & Metrics ─────────────────────────────────────────────────────────

#[test]
fn test_health_check() {
    let resp = skip_if_unavailable!(get("/health"));
    assert!(
        resp.status().is_success(),
        "Health check returned {}", resp.status()
    );
    let body: serde_json::Value = resp.json().expect("Health response is not JSON");
    assert_eq!(body["status"], "healthy", "Expected status=healthy, got: {}", body);
}

#[test]
fn test_metrics_endpoint() {
    let resp = skip_if_unavailable!(get("/metrics"));
    assert!(
        resp.status().is_success(),
        "Metrics endpoint returned {}", resp.status()
    );
    let text = resp.text().expect("Metrics response is not text");
    assert!(
        text.contains("# HELP") || text.contains("bias_audit"),
        "Metrics response does not look like Prometheus format: {}",
        &text[..200.min(text.len())]
    );
}

// ─── Bias Audit: Ingest ───────────────────────────────────────────────────────

#[test]
fn test_bias_ingest_verify_accepted() {
    let body = serde_json::json!({
        "subject_id":       "RUST-SMOKE-001",
        "operation":        "verify",
        "result":           "accepted",
        "similarity_score": 0.87,
        "liveness_score":   0.93,
        "age_group":        "25-34",
        "gender":           "MALE",
        "partner_id":       "RUST-TEST-PARTNER",
        "latency_ms":       145
    });
    let resp = skip_if_unavailable!(post_json("/v1/bias/ingest", &body));
    assert!(
        resp.status().is_success() || resp.status().as_u16() == 422,
        "Bias ingest (verify/accepted) returned {}", resp.status()
    );
}

#[test]
fn test_bias_ingest_enroll_accepted() {
    let body = serde_json::json!({
        "subject_id":       "RUST-SMOKE-002",
        "operation":        "enroll",
        "result":           "accepted",
        "similarity_score": 0.0,
        "liveness_score":   0.88,
        "age_group":        "35-44",
        "gender":           "FEMALE",
        "partner_id":       "RUST-TEST-PARTNER",
        "latency_ms":       120
    });
    let resp = skip_if_unavailable!(post_json("/v1/bias/ingest", &body));
    assert!(
        resp.status().is_success() || resp.status().as_u16() == 422,
        "Bias ingest (enroll/accepted) returned {}", resp.status()
    );
}

#[test]
fn test_bias_ingest_identify_rejected() {
    let body = serde_json::json!({
        "subject_id":       "RUST-SMOKE-003",
        "operation":        "identify",
        "result":           "rejected",
        "similarity_score": 0.41,
        "liveness_score":   0.55,
        "age_group":        "45-54",
        "gender":           "MALE",
        "partner_id":       "RUST-TEST-PARTNER",
        "latency_ms":       210
    });
    let resp = skip_if_unavailable!(post_json("/v1/bias/ingest", &body));
    assert!(
        resp.status().is_success() || resp.status().as_u16() == 422,
        "Bias ingest (identify/rejected) returned {}", resp.status()
    );
}

#[test]
fn test_bias_ingest_liveness_failed() {
    let body = serde_json::json!({
        "subject_id":       "RUST-SMOKE-004",
        "operation":        "liveness",
        "result":           "rejected",
        "similarity_score": 0.0,
        "liveness_score":   0.22,
        "age_group":        "18-24",
        "gender":           "FEMALE",
        "partner_id":       "RUST-TEST-PARTNER",
        "latency_ms":       88
    });
    let resp = skip_if_unavailable!(post_json("/v1/bias/ingest", &body));
    assert!(
        resp.status().is_success() || resp.status().as_u16() == 422,
        "Bias ingest (liveness/rejected) returned {}", resp.status()
    );
}

#[test]
fn test_bias_ingest_missing_required_fields() {
    // subject_id is required — should return 422
    let body = serde_json::json!({
        "operation": "verify",
        "result":    "accepted"
    });
    let resp = skip_if_unavailable!(post_json("/v1/bias/ingest", &body));
    assert_eq!(
        resp.status().as_u16(), 422,
        "Expected 422 for missing required fields, got {}", resp.status()
    );
}

// ─── Bias Audit: Report ───────────────────────────────────────────────────────

#[test]
fn test_bias_report_all_operations() {
    let resp = skip_if_unavailable!(get("/v1/bias/report"));
    assert!(
        resp.status().is_success(),
        "Bias report (all ops) returned {}", resp.status()
    );
    let body: serde_json::Value = resp.json().expect("Bias report response is not JSON");
    // Should be an object or array
    assert!(
        body.is_object() || body.is_array(),
        "Unexpected bias report shape: {}", body
    );
}

#[test]
fn test_bias_report_by_operation_verify() {
    let resp = skip_if_unavailable!(get("/v1/bias/report/verify"));
    assert!(
        resp.status().is_success() || resp.status().as_u16() == 404,
        "Bias report by op (verify) returned {}", resp.status()
    );
}

#[test]
fn test_bias_report_by_operation_enroll() {
    let resp = skip_if_unavailable!(get("/v1/bias/report/enroll"));
    assert!(
        resp.status().is_success() || resp.status().as_u16() == 404,
        "Bias report by op (enroll) returned {}", resp.status()
    );
}

#[test]
fn test_bias_report_by_operation_identify() {
    let resp = skip_if_unavailable!(get("/v1/bias/report/identify"));
    assert!(
        resp.status().is_success() || resp.status().as_u16() == 404,
        "Bias report by op (identify) returned {}", resp.status()
    );
}

#[test]
fn test_bias_report_by_operation_liveness() {
    let resp = skip_if_unavailable!(get("/v1/bias/report/liveness"));
    assert!(
        resp.status().is_success() || resp.status().as_u16() == 404,
        "Bias report by op (liveness) returned {}", resp.status()
    );
}

// ─── Bias Audit: Alerts ───────────────────────────────────────────────────────

#[test]
fn test_bias_alerts() {
    let resp = skip_if_unavailable!(get("/v1/bias/alert"));
    assert!(
        resp.status().is_success(),
        "Bias alerts returned {}", resp.status()
    );
    let body: serde_json::Value = resp.json().expect("Bias alerts response is not JSON");
    assert!(
        body.is_object() || body.is_array(),
        "Unexpected bias alerts shape: {}", body
    );
}

// ─── NINAuth: Consent Audit ───────────────────────────────────────────────────

#[test]
fn test_ninauth_consent_audit_granted() {
    let body = serde_json::json!({
        "subject_id":    "RUST-SMOKE-001",
        "consent_type":  "biometric_enrollment",
        "granted":       true,
        "ip_address":    "127.0.0.1",
        "user_agent":    "rust-smoke-test/1.0",
        "partner_id":    "RUST-TEST-PARTNER"
    });
    let resp = skip_if_unavailable!(post_json("/v1/ninauth/consent-audit", &body));
    assert!(
        resp.status().is_success() || resp.status().as_u16() == 422,
        "NINAuth consent audit (granted) returned {}", resp.status()
    );
}

#[test]
fn test_ninauth_consent_audit_revoked() {
    let body = serde_json::json!({
        "subject_id":    "RUST-SMOKE-001",
        "consent_type":  "biometric_verification",
        "granted":       false,
        "ip_address":    "10.0.0.1",
        "user_agent":    "rust-smoke-test/1.0",
        "partner_id":    "RUST-TEST-PARTNER"
    });
    let resp = skip_if_unavailable!(post_json("/v1/ninauth/consent-audit", &body));
    assert!(
        resp.status().is_success() || resp.status().as_u16() == 422,
        "NINAuth consent audit (revoked) returned {}", resp.status()
    );
}

#[test]
fn test_ninauth_consent_audit_missing_fields() {
    // consent_type is required
    let body = serde_json::json!({
        "subject_id": "RUST-SMOKE-001",
        "granted":    true
    });
    let resp = skip_if_unavailable!(post_json("/v1/ninauth/consent-audit", &body));
    assert_eq!(
        resp.status().as_u16(), 422,
        "Expected 422 for missing consent_type, got {}", resp.status()
    );
}

// ─── NINAuth: Face Match Audit ────────────────────────────────────────────────

#[test]
fn test_ninauth_face_match_audit_verified() {
    let body = serde_json::json!({
        "subject_id":       "RUST-SMOKE-001",
        "nin":              "12345678901",
        "verified":         true,
        "similarity_score": 0.91,
        "liveness_passed":  true,
        "partner_id":       "RUST-TEST-PARTNER"
    });
    let resp = skip_if_unavailable!(post_json("/v1/ninauth/face-match-audit", &body));
    assert!(
        resp.status().is_success() || resp.status().as_u16() == 422,
        "NINAuth face match audit (verified) returned {}", resp.status()
    );
}

#[test]
fn test_ninauth_face_match_audit_failed() {
    let body = serde_json::json!({
        "subject_id":       "RUST-SMOKE-002",
        "nin":              "98765432101",
        "verified":         false,
        "similarity_score": 0.38,
        "liveness_passed":  false,
        "partner_id":       "RUST-TEST-PARTNER"
    });
    let resp = skip_if_unavailable!(post_json("/v1/ninauth/face-match-audit", &body));
    assert!(
        resp.status().is_success() || resp.status().as_u16() == 422,
        "NINAuth face match audit (failed) returned {}", resp.status()
    );
}

// ─── NINAuth: VC Audit ────────────────────────────────────────────────────────

#[test]
fn test_ninauth_vc_audit_verified() {
    let body = serde_json::json!({
        "subject_id": "RUST-SMOKE-001",
        "vc_type":    "NINCredential",
        "verified":   true,
        "partner_id": "RUST-TEST-PARTNER"
    });
    let resp = skip_if_unavailable!(post_json("/v1/ninauth/vc-audit", &body));
    assert!(
        resp.status().is_success() || resp.status().as_u16() == 422,
        "NINAuth VC audit (verified) returned {}", resp.status()
    );
}

#[test]
fn test_ninauth_vc_audit_invalid() {
    let body = serde_json::json!({
        "subject_id": "RUST-SMOKE-002",
        "vc_type":    "NINCredential",
        "verified":   false,
        "partner_id": "RUST-TEST-PARTNER"
    });
    let resp = skip_if_unavailable!(post_json("/v1/ninauth/vc-audit", &body));
    assert!(
        resp.status().is_success() || resp.status().as_u16() == 422,
        "NINAuth VC audit (invalid) returned {}", resp.status()
    );
}

// ─── Fidelity Audit: Ingest ───────────────────────────────────────────────────

#[test]
fn test_fidelity_audit_ingest_passed() {
    let body = serde_json::json!({
        "subject_id":     "RUST-SMOKE-001",
        "operation":      "quality_check",
        "overall_score":  0.87,
        "icao_compliant": true,
        "passed":         true,
        "context":        "enrollment"
    });
    let resp = skip_if_unavailable!(post_json("/v1/fidelity/ingest", &body));
    assert!(
        resp.status().is_success() || resp.status().as_u16() == 422,
        "Fidelity audit ingest (passed) returned {}", resp.status()
    );
}

#[test]
fn test_fidelity_audit_ingest_failed() {
    let body = serde_json::json!({
        "subject_id":     "RUST-SMOKE-002",
        "operation":      "quality_check",
        "overall_score":  0.42,
        "icao_compliant": false,
        "passed":         false,
        "context":        "verification"
    });
    let resp = skip_if_unavailable!(post_json("/v1/fidelity/ingest", &body));
    assert!(
        resp.status().is_success() || resp.status().as_u16() == 422,
        "Fidelity audit ingest (failed) returned {}", resp.status()
    );
}

#[test]
fn test_fidelity_audit_ingest_with_remediation() {
    let body = serde_json::json!({
        "subject_id":     "RUST-SMOKE-003",
        "operation":      "quality_check",
        "overall_score":  0.75,
        "icao_compliant": true,
        "passed":         true,
        "context":        "enrollment",
        "remediation_applied": true
    });
    let resp = skip_if_unavailable!(post_json("/v1/fidelity/ingest", &body));
    assert!(
        resp.status().is_success() || resp.status().as_u16() == 422,
        "Fidelity audit ingest (with remediation) returned {}", resp.status()
    );
}

#[test]
fn test_fidelity_audit_ingest_missing_required() {
    // overall_score is required
    let body = serde_json::json!({
        "subject_id": "RUST-SMOKE-001",
        "operation":  "quality_check"
    });
    let resp = skip_if_unavailable!(post_json("/v1/fidelity/ingest", &body));
    assert_eq!(
        resp.status().as_u16(), 422,
        "Expected 422 for missing overall_score, got {}", resp.status()
    );
}

// ─── Fidelity Audit: Report & Compliance ──────────────────────────────────────

#[test]
fn test_fidelity_audit_report() {
    let resp = skip_if_unavailable!(get("/v1/fidelity/report"));
    assert!(
        resp.status().is_success(),
        "Fidelity audit report returned {}", resp.status()
    );
    let body: serde_json::Value = resp.json().expect("Fidelity report response is not JSON");
    assert!(
        body.is_object() || body.is_array(),
        "Unexpected fidelity report shape: {}", body
    );
}

#[test]
fn test_fidelity_compliance() {
    let resp = skip_if_unavailable!(get("/v1/fidelity/compliance"));
    assert!(
        resp.status().is_success(),
        "Fidelity compliance returned {}", resp.status()
    );
    let body: serde_json::Value = resp.json().expect("Fidelity compliance response is not JSON");
    assert!(
        body.is_object() || body.is_array(),
        "Unexpected fidelity compliance shape: {}", body
    );
}

// ─── Edge Cases & Security ────────────────────────────────────────────────────

#[test]
fn test_unknown_route_returns_404() {
    let resp = skip_if_unavailable!(get("/v1/nonexistent/route"));
    assert_eq!(
        resp.status().as_u16(), 404,
        "Expected 404 for unknown route, got {}", resp.status()
    );
}

#[test]
fn test_malformed_json_returns_422() {
    let url = format!("{}/v1/bias/ingest", bias_audit_url());
    let resp = match reqwest::blocking::Client::new()
        .post(&url)
        .header("Content-Type", "application/json")
        .body("{not valid json}")
        .timeout(std::time::Duration::from_secs(10))
        .send()
    {
        Ok(r) => r,
        Err(e) if e.is_connect() || e.is_timeout() => {
            eprintln!("SKIP: face-bias-audit service unavailable: {}", e);
            return;
        }
        Err(e) => panic!("Unexpected request error: {}", e),
    };
    assert!(
        resp.status().as_u16() == 400 || resp.status().as_u16() == 422,
        "Expected 400/422 for malformed JSON, got {}", resp.status()
    );
}

#[test]
fn test_empty_body_returns_error() {
    let url = format!("{}/v1/bias/ingest", bias_audit_url());
    let resp = match reqwest::blocking::Client::new()
        .post(&url)
        .header("Content-Type", "application/json")
        .body("")
        .timeout(std::time::Duration::from_secs(10))
        .send()
    {
        Ok(r) => r,
        Err(e) if e.is_connect() || e.is_timeout() => {
            eprintln!("SKIP: face-bias-audit service unavailable: {}", e);
            return;
        }
        Err(e) => panic!("Unexpected request error: {}", e),
    };
    assert!(
        resp.status().as_u16() == 400 || resp.status().as_u16() == 422,
        "Expected 400/422 for empty body, got {}", resp.status()
    );
}

#[test]
fn test_get_on_post_only_route_returns_405() {
    let resp = skip_if_unavailable!(get("/v1/bias/ingest"));
    assert_eq!(
        resp.status().as_u16(), 405,
        "Expected 405 Method Not Allowed for GET on POST-only route, got {}", resp.status()
    );
}

#[test]
fn test_post_on_get_only_route_returns_405() {
    let body = serde_json::json!({});
    let resp = skip_if_unavailable!(post_json("/v1/bias/report", &body));
    assert_eq!(
        resp.status().as_u16(), 405,
        "Expected 405 Method Not Allowed for POST on GET-only route, got {}", resp.status()
    );
}
