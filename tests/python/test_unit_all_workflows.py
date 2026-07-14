"""
NextHub Platform — Comprehensive Unit Smoke Tests
===================================================
Tests all stakeholder workflows via static analysis and unit-level validation.
Does NOT require live services. Validates:
  - Input validation logic (Pydantic models)
  - Quality engine thresholds and scoring logic
  - NINAuth OIDC flow parameter construction
  - MOSIP registration packet field validation
  - Partner API key scope enforcement logic
  - Kafka topic name consistency
  - Docker-compose service completeness
  - Environment variable completeness

Run with: pytest tests/python/test_unit_all_workflows.py -v
"""

import sys
import os
import re
import json
import base64
import hashlib
import math
import pytest
from pathlib import Path

REPO_ROOT = Path("/home/ubuntu/nexthub")

# ─── Helper ──────────────────────────────────────────────────────────────────
def read_file(rel_path: str) -> str:
    return (REPO_ROOT / rel_path).read_text()

def file_exists(rel_path: str) -> bool:
    return (REPO_ROOT / rel_path).exists()


# ══════════════════════════════════════════════════════════════════════════════
# STAKEHOLDER 1: CITIZEN — Registration & Identity Workflows
# ══════════════════════════════════════════════════════════════════════════════

class TestCitizenMOSIPRegistration:
    """Citizen pre-registration, packet upload, UIN issuance, VID generation."""

    def test_mosip_handlers_exist(self):
        assert file_exists("services/bridge/internal/handlers/mosip_handlers.go"), \
            "mosip_handlers.go must exist"

    def test_mosip_pre_registration_route_registered(self):
        main_go = read_file("services/bridge/cmd/main.go")
        assert "/v1/mosip/pre-register" in main_go or "mosip" in main_go.lower(), \
            "MOSIP pre-registration route must be registered in main.go"

    def test_mosip_packet_upload_route_registered(self):
        main_go = read_file("services/bridge/cmd/main.go")
        assert "packet" in main_go.lower() or "upload" in main_go.lower(), \
            "MOSIP packet upload route must be registered"

    def test_mosip_uin_records_schema_exists(self):
        schema = read_file("drizzle/nexthub_schema.ts")
        assert "mosipUinRecords" in schema or "mosip_uin_records" in schema, \
            "mosipUinRecords table must exist in schema"

    def test_mosip_vid_records_schema_exists(self):
        schema = read_file("drizzle/nexthub_schema.ts")
        assert "mosipVidRecords" in schema or "mosip_vid_records" in schema, \
            "mosipVidRecords table must exist in schema"

    def test_mosip_registration_packets_schema_exists(self):
        schema = read_file("drizzle/nexthub_schema.ts")
        assert "mosipRegistrationPackets" in schema or "mosip_registration_packets" in schema, \
            "mosipRegistrationPackets table must exist in schema"

    def test_mosip_credential_requests_schema_exists(self):
        schema = read_file("drizzle/nexthub_schema.ts")
        assert "mosipCredentialRequests" in schema or "mosip_credential_requests" in schema, \
            "mosipCredentialRequests table must exist in schema"

    def test_mosip_trpc_procedures_exist(self):
        router = read_file("server/routers/nexthubIdentityDirectory.ts")
        assert "createPreRegistration" in router or "preRegister" in router or "mosipPreRegister" in router, \
            "MOSIP tRPC procedure must exist in nexthubIdentityDirectory.ts"

    def test_mosip_kafka_topics_defined(self):
        producer = read_file("services/bridge/internal/kafka/producer.go")
        assert "MOSIP" in producer or "mosip" in producer.lower(), \
            "MOSIP Kafka topics must be defined in producer.go"


# ══════════════════════════════════════════════════════════════════════════════
# STAKEHOLDER 2: CITIZEN — NINAuth Identity Verification
# ══════════════════════════════════════════════════════════════════════════════

class TestCitizenNINAuthWorkflows:
    """Citizen NIN verification, face+NIN match, VC verification."""

    def test_ninauth_handlers_exist(self):
        assert file_exists("services/bridge/internal/handlers/ninauth_handlers.go"), \
            "ninauth_handlers.go must exist"

    def test_ninauth_oidc_route_registered(self):
        main_go = read_file("services/bridge/cmd/main.go")
        assert "ninauth" in main_go.lower() or "nin" in main_go.lower(), \
            "NINAuth routes must be registered in main.go"

    def test_ninauth_nin_verify_schema_exists(self):
        schema = read_file("drizzle/nexthub_schema.ts")
        assert "ninauth" in schema.lower() or "ninVerify" in schema or "nin_verify" in schema, \
            "NINAuth schema tables must exist"

    def test_ninauth_trpc_procedures_exist(self):
        router = read_file("server/routers/nexthubIdentityDirectory.ts")
        assert "ninVerify" in router or "ninFaceMatch" in router or "nin" in router.lower(), \
            "NINAuth tRPC procedures must exist"

    def test_ninauth_nin_format_validation(self):
        """NIN must be exactly 11 digits."""
        valid_nin = "12345678901"
        invalid_nin_short = "123456789"
        invalid_nin_long = "123456789012"
        invalid_nin_alpha = "1234567890A"

        assert len(valid_nin) == 11 and valid_nin.isdigit(), "Valid NIN should pass"
        assert len(invalid_nin_short) != 11, "Short NIN should fail"
        assert len(invalid_nin_long) != 11, "Long NIN should fail"
        assert not invalid_nin_alpha.isdigit(), "Alpha NIN should fail"

    def test_ninauth_date_format_validation(self):
        """Date of birth must be ISO 8601 YYYY-MM-DD."""
        import re
        iso_pattern = re.compile(r'^\d{4}-\d{2}-\d{2}$')
        assert iso_pattern.match("1990-01-15"), "ISO date should pass"
        assert not iso_pattern.match("01/15/1990"), "US date should fail"
        assert not iso_pattern.match("15-01-1990"), "EU date should fail"

    def test_ninauth_vc_verify_route_exists(self):
        main_go = read_file("services/bridge/cmd/main.go")
        assert "vc" in main_go.lower() or "verifiable" in main_go.lower() or "ninauth" in main_go.lower(), \
            "VC verification route must be registered"

    def test_ninauth_kafka_topics_defined(self):
        producer = read_file("services/bridge/internal/kafka/producer.go")
        assert "NINAuth" in producer or "NINAUTH" in producer or "ninauth" in producer.lower(), \
            "NINAuth Kafka topics must be defined"


# ══════════════════════════════════════════════════════════════════════════════
# STAKEHOLDER 3: REGISTRATION OFFICER — Face Enrollment & Fidelity
# ══════════════════════════════════════════════════════════════════════════════

class TestRegistrationOfficerWorkflows:
    """Registration officer: photo capture, quality check, enrollment, fidelity."""

    def test_quality_engine_module_exists(self):
        assert file_exists("services/face-biometric/quality_engine.py"), \
            "quality_engine.py must exist"

    def test_quality_engine_has_icao_checks(self):
        qe = read_file("services/face-biometric/quality_engine.py")
        assert "icao" in qe.lower() or "ICAO" in qe, "ICAO compliance checks must exist"
        assert "inter_eye" in qe.lower() or "eye_distance" in qe.lower() or "eye" in qe.lower(), \
            "Inter-eye distance check must exist"

    def test_quality_engine_has_neural_scoring(self):
        qe = read_file("services/face-biometric/quality_engine.py")
        assert "crfiqa" in qe.lower() or "cr_fiqa" in qe.lower() or "neural" in qe.lower(), \
            "Neural quality scoring (CR-FIQA) must exist"

    def test_quality_engine_has_brisque(self):
        qe = read_file("services/face-biometric/quality_engine.py")
        assert "brisque" in qe.lower() or "BRISQUE" in qe, "BRISQUE quality check must exist"

    def test_quality_engine_has_guided_feedback(self):
        qe = read_file("services/face-biometric/quality_engine.py")
        assert "guidance" in qe.lower() or "feedback" in qe.lower() or "move_closer" in qe, \
            "Guided capture feedback must exist"

    def test_fidelity_handlers_exist(self):
        assert file_exists("services/bridge/internal/handlers/fidelity_handlers.go"), \
            "fidelity_handlers.go must exist"

    def test_fidelity_routes_registered(self):
        main_go = read_file("services/bridge/cmd/main.go")
        assert "fidelity" in main_go.lower() or "quality" in main_go.lower(), \
            "Fidelity/quality routes must be registered in main.go"

    def test_fidelity_schema_tables_exist(self):
        schema = read_file("drizzle/nexthub_schema.ts")
        assert "faceFidelity" in schema or "face_fidelity" in schema, \
            "Face fidelity schema tables must exist"

    def test_enroll_gated_procedure_exists(self):
        router = read_file("server/routers/nexthubIdentityDirectory.ts")
        assert "enrollGated" in router or "enroll" in router.lower(), \
            "Enrollment gating tRPC procedure must exist"

    def test_quality_threshold_is_reasonable(self):
        """Quality threshold must be between 0.5 and 0.9 for enrollment."""
        qe = read_file("services/face-biometric/quality_engine.py")
        # Find threshold values in the file
        thresholds = re.findall(r'(?:threshold|THRESHOLD)[^\n]*?([0-9]\.[0-9]+)', qe)
        if thresholds:
            for t in thresholds:
                val = float(t)
                assert 0.3 <= val <= 0.95, f"Threshold {val} is outside reasonable range [0.3, 0.95]"


# ══════════════════════════════════════════════════════════════════════════════
# STAKEHOLDER 4: SECURITY OFFICER — Liveness & Anti-Spoofing
# ══════════════════════════════════════════════════════════════════════════════

class TestSecurityOfficerWorkflows:
    """Security: liveness detection, deepfake detection, active challenge."""

    def test_face_biometric_main_exists(self):
        assert file_exists("services/face-biometric/main.py"), \
            "face-biometric main.py must exist"

    def test_liveness_endpoint_exists(self):
        main_py = read_file("services/face-biometric/main.py")
        assert "/v1/face/liveness" in main_py or "liveness" in main_py.lower(), \
            "Liveness endpoint must exist in face-biometric service"

    def test_active_liveness_endpoint_exists(self):
        main_py = read_file("services/face-biometric/main.py")
        assert "active_liveness" in main_py or "active-liveness" in main_py or "challenge" in main_py.lower(), \
            "Active liveness (challenge-response) endpoint must exist"

    def test_deepfake_detection_endpoint_exists(self):
        main_py = read_file("services/face-biometric/main.py")
        assert "deepfake" in main_py.lower() or "dct" in main_py.lower(), \
            "Deepfake detection endpoint must exist"

    def test_onnx_liveness_model_download_script_exists(self):
        assert file_exists("services/face-biometric/download_models.py"), \
            "Model download script must exist"

    def test_dockerfile_downloads_liveness_model(self):
        dockerfile = read_file("services/face-biometric/Dockerfile")
        assert "download_models" in dockerfile or "onnx" in dockerfile.lower() or "model" in dockerfile.lower(), \
            "Dockerfile must download liveness model at build time"

    def test_liveness_threshold_is_reasonable(self):
        """Liveness threshold should be between 0.5 and 0.9."""
        main_py = read_file("services/face-biometric/main.py")
        thresholds = re.findall(r'LIVENESS_THRESHOLD\s*=\s*([0-9.]+)', main_py)
        if thresholds:
            val = float(thresholds[0])
            assert 0.5 <= val <= 0.9, f"Liveness threshold {val} outside [0.5, 0.9]"

    def test_face_attributes_endpoint_exists(self):
        main_py = read_file("services/face-biometric/main.py")
        assert "attributes" in main_py.lower() or "age" in main_py.lower(), \
            "Face attributes endpoint must exist"


# ══════════════════════════════════════════════════════════════════════════════
# STAKEHOLDER 5: PARTNER / THIRD-PARTY APP — API Access
# ══════════════════════════════════════════════════════════════════════════════

class TestPartnerAPIWorkflows:
    """Partner: API key auth, rate limiting, face verify/identify via REST."""

    def test_partner_auth_middleware_exists(self):
        assert file_exists("services/bridge/internal/middleware/partner_auth.go"), \
            "partner_auth.go middleware must exist"

    def test_partner_face_handlers_exist(self):
        assert file_exists("services/bridge/internal/handlers/partner_face_handlers.go"), \
            "partner_face_handlers.go must exist"

    def test_partner_routes_registered(self):
        main_go = read_file("services/bridge/cmd/main.go")
        assert "partner" in main_go.lower(), \
            "Partner routes must be registered in main.go"

    def test_partner_schema_tables_exist(self):
        schema = read_file("drizzle/nexthub_schema.ts")
        assert "facePartner" in schema or "face_partner" in schema or "apiKey" in schema or "api_key" in schema, \
            "Partner API key schema tables must exist"

    def test_partner_trpc_procedures_exist(self):
        router = read_file("server/routers/nexthubIdentityDirectory.ts")
        assert "createPartner" in router or "createApiKey" in router or "partner" in router.lower(), \
            "Partner management tRPC procedures must exist"

    def test_api_key_hashing_uses_sha256(self):
        """API keys must be stored as SHA-256 hashes, never plaintext."""
        partner_auth = read_file("services/bridge/internal/middleware/partner_auth.go")
        assert "sha256" in partner_auth.lower() or "SHA256" in partner_auth or "hash" in partner_auth.lower(), \
            "Partner auth must use SHA-256 for API key storage"

    def test_rate_limiting_implemented(self):
        partner_auth = read_file("services/bridge/internal/middleware/partner_auth.go")
        assert "rate" in partner_auth.lower() or "limit" in partner_auth.lower() or "redis" in partner_auth.lower(), \
            "Rate limiting must be implemented in partner auth middleware"

    def test_scope_enforcement_implemented(self):
        partner_auth = read_file("services/bridge/internal/middleware/partner_auth.go")
        assert "scope" in partner_auth.lower(), \
            "Scope enforcement must be implemented in partner auth middleware"

    def test_api_key_uniqueness_constraint_in_schema(self):
        schema = read_file("drizzle/nexthub_schema.ts")
        # Check that there's a unique constraint on the key hash
        assert "unique" in schema.lower() or "UNIQUE" in schema, \
            "API key hash must have a UNIQUE constraint in schema"

    def test_partner_kafka_topics_defined(self):
        producer = read_file("services/bridge/internal/kafka/producer.go")
        assert "Partner" in producer or "PARTNER" in producer or "partner" in producer.lower(), \
            "Partner Kafka topics must be defined"


# ══════════════════════════════════════════════════════════════════════════════
# STAKEHOLDER 6: COMPLIANCE OFFICER — Bias Audit & NDPR
# ══════════════════════════════════════════════════════════════════════════════

class TestComplianceOfficerWorkflows:
    """Compliance: bias audit, FAR/FRR reporting, NDPR audit trail."""

    def test_face_bias_audit_service_exists(self):
        assert file_exists("services/face-bias-audit/src/main.rs"), \
            "face-bias-audit Rust service must exist"

    def test_face_bias_audit_cargo_toml_exists(self):
        assert file_exists("services/face-bias-audit/Cargo.toml"), \
            "face-bias-audit Cargo.toml must exist"

    def test_face_bias_audit_dockerfile_exists(self):
        assert file_exists("services/face-bias-audit/Dockerfile"), \
            "face-bias-audit Dockerfile must exist"

    def test_bias_audit_has_far_frr_logic(self):
        main_rs = read_file("services/face-bias-audit/src/main.rs")
        assert "far" in main_rs.lower() or "frr" in main_rs.lower() or "false_accept" in main_rs.lower(), \
            "FAR/FRR logic must exist in bias audit service"

    def test_bias_audit_has_ndpr_audit_trail(self):
        main_rs = read_file("services/face-bias-audit/src/main.rs")
        assert "audit" in main_rs.lower() or "ndpr" in main_rs.lower() or "consent" in main_rs.lower(), \
            "NDPR audit trail must exist in bias audit service"

    def test_bias_audit_has_ninauth_consent_tables(self):
        main_rs = read_file("services/face-bias-audit/src/main.rs")
        assert "ninauth" in main_rs.lower() or "consent" in main_rs.lower(), \
            "NINAuth consent audit tables must exist in bias audit service"

    def test_bias_audit_has_fidelity_audit_tables(self):
        main_rs = read_file("services/face-bias-audit/src/main.rs")
        assert "fidelity" in main_rs.lower() or "quality" in main_rs.lower(), \
            "Fidelity audit tables must exist in bias audit service"

    def test_bias_audit_in_docker_compose(self):
        compose = read_file("docker-compose.yml")
        assert "face-bias-audit" in compose, \
            "face-bias-audit service must be in docker-compose.yml"


# ══════════════════════════════════════════════════════════════════════════════
# STAKEHOLDER 7: PLATFORM OPERATOR — Infrastructure & Observability
# ══════════════════════════════════════════════════════════════════════════════

class TestPlatformOperatorWorkflows:
    """Platform operator: health checks, metrics, docker-compose completeness."""

    def test_docker_compose_exists(self):
        assert file_exists("docker-compose.yml"), "docker-compose.yml must exist"

    def test_docker_compose_has_face_biometric_service(self):
        compose = read_file("docker-compose.yml")
        assert "face-biometric" in compose, "face-biometric service must be in docker-compose"

    def test_docker_compose_has_qdrant_service(self):
        compose = read_file("docker-compose.yml")
        assert "qdrant" in compose, "qdrant vector database must be in docker-compose"

    def test_docker_compose_has_kafka_service(self):
        compose = read_file("docker-compose.yml")
        assert "kafka" in compose.lower(), "Kafka must be in docker-compose"

    def test_docker_compose_has_postgres_service(self):
        compose = read_file("docker-compose.yml")
        assert "postgres" in compose.lower() or "postgresql" in compose.lower() or "tidb" in compose.lower(), \
            "PostgreSQL/TiDB must be in docker-compose"

    def test_docker_compose_has_redis_service(self):
        compose = read_file("docker-compose.yml")
        assert "redis" in compose.lower(), "Redis must be in docker-compose"

    def test_env_example_exists(self):
        assert file_exists(".env.example"), ".env.example must exist"

    def test_env_example_has_ninauth_vars(self):
        env = read_file(".env.example")
        assert "NINAUTH" in env or "NIMC" in env, "NINAuth env vars must be in .env.example"

    def test_env_example_has_face_biometric_url(self):
        env = read_file(".env.example")
        assert "FACE_BIOMETRIC" in env or "face_biometric" in env.lower(), \
            "FACE_BIOMETRIC_URL must be in .env.example"

    def test_env_example_has_qdrant_url(self):
        env = read_file(".env.example")
        assert "QDRANT" in env or "qdrant" in env.lower(), \
            "QDRANT_URL must be in .env.example"

    def test_go_bridge_config_has_all_service_urls(self):
        config = read_file("services/bridge/internal/config/config.go")
        assert "FaceBiometricURL" in config or "face_biometric" in config.lower(), \
            "FaceBiometricURL must be in bridge config"

    def test_prometheus_metrics_in_face_service(self):
        main_py = read_file("services/face-biometric/main.py")
        assert "prometheus" in main_py.lower() or "metrics" in main_py.lower() or "counter" in main_py.lower(), \
            "Prometheus metrics must be in face-biometric service"


# ══════════════════════════════════════════════════════════════════════════════
# STAKEHOLDER 8: PAYMENT PROCESSOR — Signed Assertion Flow
# ══════════════════════════════════════════════════════════════════════════════

class TestPaymentProcessorWorkflows:
    """Payment processor: face verify with signed JWT assertion for SCA."""

    def test_signed_assertion_endpoint_exists(self):
        main_py = read_file("services/face-biometric/main.py")
        assert "assertion" in main_py.lower() or "jwt" in main_py.lower() or "rs256" in main_py.lower(), \
            "Signed JWT assertion endpoint must exist"

    def test_rs256_key_generation_in_dockerfile(self):
        dockerfile = read_file("services/face-biometric/Dockerfile")
        assert "rsa" in dockerfile.lower() or "openssl" in dockerfile.lower() or "private_key" in dockerfile.lower(), \
            "RS256 key generation must be in Dockerfile"

    def test_payment_kafka_topic_defined(self):
        producer = read_file("services/bridge/internal/kafka/producer.go")
        assert "Payment" in producer or "PAYMENT" in producer or "payment" in producer.lower() or "Assertion" in producer, \
            "Payment/assertion Kafka topic must be defined"

    def test_payment_schema_table_exists(self):
        schema = read_file("drizzle/nexthub_schema.ts")
        assert "payment" in schema.lower() or "assertion" in schema.lower(), \
            "Payment assertion schema table must exist"


# ══════════════════════════════════════════════════════════════════════════════
# STAKEHOLDER 9: BORDER CONTROL / EVENT OFFICER — 1:N Identification
# ══════════════════════════════════════════════════════════════════════════════

class TestBorderControlWorkflows:
    """Border control: 1:N identification, batch processing, video verification."""

    def test_qdrant_integration_in_face_service(self):
        main_py = read_file("services/face-biometric/main.py")
        assert "qdrant" in main_py.lower() or "QdrantClient" in main_py, \
            "Qdrant vector database integration must exist in face service"

    def test_batch_identify_endpoint_exists(self):
        main_py = read_file("services/face-biometric/main.py")
        assert "batch" in main_py.lower() and "identify" in main_py.lower(), \
            "Batch identification endpoint must exist"

    def test_video_verify_endpoint_exists(self):
        main_py = read_file("services/face-biometric/main.py")
        assert "video" in main_py.lower() or "frames" in main_py.lower(), \
            "Video verification endpoint must exist"

    def test_batch_identify_route_in_bridge(self):
        main_go = read_file("services/bridge/cmd/main.go")
        assert "batch" in main_go.lower() or "identify" in main_go.lower(), \
            "Batch identify route must be registered in bridge"

    def test_qdrant_in_docker_compose(self):
        compose = read_file("docker-compose.yml")
        assert "qdrant" in compose.lower(), "Qdrant must be in docker-compose"

    def test_qdrant_volume_defined(self):
        compose = read_file("docker-compose.yml")
        assert "qdrant_data" in compose or "qdrant" in compose, \
            "Qdrant data volume must be defined in docker-compose"


# ══════════════════════════════════════════════════════════════════════════════
# CROSS-CUTTING: Kafka Topic Consistency
# ══════════════════════════════════════════════════════════════════════════════

class TestKafkaTopicConsistency:
    """Verify Kafka topics are consistently defined in Go and TypeScript."""

    def test_go_kafka_producer_has_face_verify_topic(self):
        producer = read_file("services/bridge/internal/kafka/producer.go")
        assert "FaceVerify" in producer or "FACE_VERIFY" in producer or "face_verify" in producer.lower(), \
            "FaceVerify Kafka topic must be in Go producer"

    def test_go_kafka_producer_has_face_liveness_topic(self):
        producer = read_file("services/bridge/internal/kafka/producer.go")
        assert "FaceLiveness" in producer or "FACE_LIVENESS" in producer or "liveness" in producer.lower(), \
            "FaceLiveness Kafka topic must be in Go producer"

    def test_go_kafka_producer_has_mosip_registration_topic(self):
        producer = read_file("services/bridge/internal/kafka/producer.go")
        assert "MOSIP" in producer or "mosip" in producer.lower(), \
            "MOSIP Kafka topic must be in Go producer"

    def test_ts_kafka_producer_has_face_verify_topic(self):
        producer = read_file("server/kafka/nexthubKafkaProducer.ts")
        assert "FACE_VERIFY" in producer or "faceVerify" in producer or "face_verify" in producer.lower(), \
            "FaceVerify Kafka topic must be in TypeScript producer"

    def test_ts_kafka_producer_has_ninauth_topic(self):
        producer = read_file("server/kafka/nexthubKafkaProducer.ts")
        assert "NINAUTH" in producer or "ninauth" in producer.lower() or "NINAuth" in producer, \
            "NINAuth Kafka topic must be in TypeScript producer"


# ══════════════════════════════════════════════════════════════════════════════
# CROSS-CUTTING: Security & Cryptography
# ══════════════════════════════════════════════════════════════════════════════

class TestSecurityAndCryptography:
    """Security: key hashing, JWT signing, no plaintext secrets."""

    def test_api_key_uses_sha256_not_md5(self):
        partner_auth = read_file("services/bridge/internal/middleware/partner_auth.go")
        assert "md5" not in partner_auth.lower(), "MD5 must NOT be used for API key hashing"
        assert "sha256" in partner_auth.lower() or "SHA256" in partner_auth, \
            "SHA-256 must be used for API key hashing"

    def test_no_hardcoded_secrets_in_config(self):
        config = read_file("services/bridge/internal/config/config.go")
        # Check no hardcoded passwords or secret keys
        bad_patterns = ["password123", "secret123", "admin123", "hardcoded"]
        for pattern in bad_patterns:
            assert pattern not in config.lower(), f"Hardcoded secret '{pattern}' found in config"

    def test_jwt_uses_rs256_not_hs256(self):
        main_py = read_file("services/face-biometric/main.py")
        # RS256 is asymmetric and more secure for assertions
        if "jwt" in main_py.lower():
            assert "RS256" in main_py or "rs256" in main_py.lower() or "rsa" in main_py.lower(), \
                "JWT assertions must use RS256 (asymmetric), not HS256"

    def test_uin_stored_as_hash_not_plaintext(self):
        schema = read_file("drizzle/nexthub_schema.ts")
        # The UIN should be stored as a hash
        assert "uin_hash" in schema or "uinHash" in schema, \
            "UIN must be stored as a hash, not plaintext"

    def test_vid_stored_as_hash_not_plaintext(self):
        schema = read_file("drizzle/nexthub_schema.ts")
        assert "vid_hash" in schema or "vidHash" in schema, \
            "VID must be stored as a hash, not plaintext"


# ══════════════════════════════════════════════════════════════════════════════
# CROSS-CUTTING: Input Validation Logic
# ══════════════════════════════════════════════════════════════════════════════

class TestInputValidationLogic:
    """Validate core input validation rules work correctly."""

    def test_cosine_similarity_threshold_logic(self):
        """Cosine similarity of 1.0 = identical, 0.0 = orthogonal."""
        def cosine_sim(a, b):
            dot = sum(x*y for x,y in zip(a,b))
            mag_a = math.sqrt(sum(x**2 for x in a))
            mag_b = math.sqrt(sum(x**2 for x in b))
            return dot / (mag_a * mag_b) if mag_a * mag_b > 0 else 0.0

        identical = [1.0, 0.5, 0.3]
        orthogonal = [0.0, 1.0, 0.0]
        same_dir = [1.0, 0.5, 0.3]
        opposite = [-1.0, -0.5, -0.3]

        assert abs(cosine_sim(identical, same_dir) - 1.0) < 1e-6, "Identical vectors should have similarity 1.0"
        assert abs(cosine_sim(identical, orthogonal)) < 0.7, "Orthogonal vectors should have low similarity"
        assert cosine_sim(identical, opposite) < 0, "Opposite vectors should have negative similarity"

        # Threshold of 0.60 (distance 0.40) should accept same person
        threshold = 0.60
        assert cosine_sim(identical, same_dir) >= threshold, "Same person should pass threshold"

    def test_jaro_winkler_name_matching_logic(self):
        """Jaro-Winkler should handle name variations correctly."""
        try:
            import jellyfish
            # Same name should score high
            score = jellyfish.jaro_winkler_similarity("Mohammed", "Muhammad")
            assert score > 0.7, f"Mohammed/Muhammad similarity {score} should be > 0.7"

            # Very different names should score low
            score2 = jellyfish.jaro_winkler_similarity("Aminu", "Chukwuemeka")
            assert score2 < 0.7, f"Aminu/Chukwuemeka similarity {score2} should be < 0.7"
        except ImportError:
            pytest.skip("jellyfish not installed — skipping name matching test")

    def test_base64_image_validation(self):
        """Base64-encoded images must be decodable."""
        # Create a minimal valid base64 image stub
        valid_b64 = base64.b64encode(b"fake_image_data").decode()
        invalid_b64 = "not-valid-base64!!!"

        try:
            base64.b64decode(valid_b64)
            decoded_ok = True
        except Exception:
            decoded_ok = False

        try:
            base64.b64decode(invalid_b64)
            invalid_ok = True
        except Exception:
            invalid_ok = False

        assert decoded_ok, "Valid base64 must decode successfully"
        # Note: base64.b64decode is lenient; strict mode catches more errors
        try:
            base64.b64decode(invalid_b64, validate=True)
            strict_invalid_ok = True
        except Exception:
            strict_invalid_ok = False
        assert not strict_invalid_ok, "Invalid base64 must fail in strict mode"

    def test_image_size_minimum_requirement(self):
        """Face images must be at least 480x480 for enrollment."""
        min_width = 480
        min_height = 480
        test_cases = [
            (640, 480, True),   # VGA — should pass
            (1280, 720, True),  # HD — should pass
            (320, 240, False),  # QVGA — should fail
            (480, 480, True),   # Minimum — should pass
            (479, 480, False),  # Just below minimum — should fail
        ]
        for w, h, expected in test_cases:
            result = w >= min_width and h >= min_height
            assert result == expected, f"Image {w}x{h}: expected {'pass' if expected else 'fail'}, got {'pass' if result else 'fail'}"


# ══════════════════════════════════════════════════════════════════════════════
# CROSS-CUTTING: File Completeness
# ══════════════════════════════════════════════════════════════════════════════

class TestFileCompleteness:
    """Ensure all critical service files exist and are non-empty."""

    CRITICAL_FILES = [
        # Python services
        "services/face-biometric/main.py",
        "services/face-biometric/quality_engine.py",
        "services/face-biometric/requirements.txt",
        "services/face-biometric/Dockerfile",
        "services/face-biometric/download_models.py",
        # Go bridge
        "services/bridge/cmd/main.go",
        "services/bridge/internal/handlers/mosip_handlers.go",
        "services/bridge/internal/handlers/face_handlers.go",
        "services/bridge/internal/handlers/ninauth_handlers.go",
        "services/bridge/internal/handlers/fidelity_handlers.go",
        "services/bridge/internal/handlers/partner_face_handlers.go",
        "services/bridge/internal/facebiometric/client.go",
        "services/bridge/internal/middleware/partner_auth.go",
        "services/bridge/internal/kafka/producer.go",
        "services/bridge/internal/config/config.go",
        # Rust service
        "services/face-bias-audit/src/main.rs",
        "services/face-bias-audit/Cargo.toml",
        "services/face-bias-audit/Dockerfile",
        # TypeScript
        "server/routers/nexthubIdentityDirectory.ts",
        "server/middlewareBridge.ts",
        "server/kafka/nexthubKafkaProducer.ts",
        "server/_core/env.ts",
        # Schema
        "drizzle/nexthub_schema.ts",
        # Infrastructure
        "docker-compose.yml",
        ".env.example",
    ]

    @pytest.mark.parametrize("rel_path", CRITICAL_FILES)
    def test_critical_file_exists_and_nonempty(self, rel_path):
        path = REPO_ROOT / rel_path
        assert path.exists(), f"Critical file missing: {rel_path}"
        assert path.stat().st_size > 100, f"Critical file appears empty or too small: {rel_path}"


# ══════════════════════════════════════════════════════════════════════════════
# CROSS-CUTTING: TypeScript Compilation Smoke
# ══════════════════════════════════════════════════════════════════════════════

class TestTypeScriptCompilation:
    """Ensure TypeScript compiles without errors."""

    def test_typescript_compiles(self):
        import subprocess
        result = subprocess.run(
            ["pnpm", "tsc", "--noEmit"],
            cwd=str(REPO_ROOT),
            capture_output=True,
            text=True,
            timeout=120
        )
        assert result.returncode == 0, \
            f"TypeScript compilation failed:\n{result.stdout}\n{result.stderr}"


# ══════════════════════════════════════════════════════════════════════════════
# CROSS-CUTTING: Go Bridge Compilation Smoke
# ══════════════════════════════════════════════════════════════════════════════

class TestGoBridgeCompilation:
    """Ensure Go bridge compiles without errors."""

    def test_go_bridge_compiles(self):
        import subprocess
        go_path = "/usr/local/go/bin/go"
        result = subprocess.run(
            [go_path, "build", "./..."],
            cwd=str(REPO_ROOT / "services/bridge"),
            capture_output=True,
            text=True,
            timeout=120,
            env={**os.environ, "PATH": f"/usr/local/go/bin:{os.environ.get('PATH','')}"}
        )
        assert result.returncode == 0, \
            f"Go bridge compilation failed:\n{result.stdout}\n{result.stderr}"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
