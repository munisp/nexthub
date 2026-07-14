// Package config loads bridge configuration from environment variables.
package config

import (
	"os"
	"strconv"
)

// Config holds all runtime configuration for the bridge service.
type Config struct {
	Port              string
	InternalKey       string
	DatabaseURL       string
	KafkaBrokers      string
	RedisAddr         string
	TemporalHost      string
	TemporalNamespace string
	PermifyEndpoint   string
	PermifyToken      string
	KeycloakURL       string
	KeycloakRealm     string
	KeycloakClientID  string
	KeycloakSecret    string
	TigerBeetleAddr   string
	LakehouseURL      string
	JWTSecret         string
	LogLevel          string
	// Face biometric services
	FaceBiometricURL string
	BiasAuditURL     string
	QdrantURL        string
	// NINAuth / NIMC
	NINAuthBaseURL string
	NIMCApiURL     string
	NIMCApiKey     string
	// MOSIP
	MOSIPPreRegURL    string
	MOSIPRegProcURL   string
	MOSIPIdRepoURL    string
	MOSIPIdaURL       string
	MOSIPIdaPartnerID string
	MOSIPIdaApiKey    string
	MOSIPIdaMispKey   string
	MOSIPCredURL      string
}

// Load reads configuration from environment variables with sensible defaults.
func Load() *Config {
	return &Config{
		Port:              getEnv("PORT", "8080"),
		InternalKey:       getEnv("MIDDLEWARE_INTERNAL_KEY", "nexthub-internal-key"),
		DatabaseURL:       getEnv("DATABASE_URL", "postgresql://user:pass@localhost:5432/nexthub_db"),
		KafkaBrokers:      getEnv("KAFKA_BROKERS", "localhost:9092"),
		RedisAddr:         getEnv("REDIS_ADDR", "localhost:6379"),
		TemporalHost:      getEnv("TEMPORAL_HOST", "localhost:7233"),
		TemporalNamespace: getEnv("TEMPORAL_NAMESPACE", "nexthub"),
		PermifyEndpoint:   getEnv("PERMIFY_ENDPOINT", "http://localhost:3476"),
		PermifyToken:      getEnv("PERMIFY_TOKEN", ""),
		KeycloakURL:       getEnv("KEYCLOAK_URL", "http://localhost:8180"),
		KeycloakRealm:     getEnv("KEYCLOAK_REALM", "nexthub"),
		KeycloakClientID:  getEnv("KEYCLOAK_CLIENT_ID", "nexthub-bridge"),
		KeycloakSecret:    getEnv("KEYCLOAK_CLIENT_SECRET", ""),
		TigerBeetleAddr:   getEnv("TIGERBEETLE_ADDRESS", "localhost:3902"),
		LakehouseURL:      getEnv("LAKEHOUSE_URL", "http://localhost:8000"),
		JWTSecret:         getEnv("JWT_SECRET", "nexthub-dev-secret-32chars-minimum"),
		LogLevel:          getEnv("LOG_LEVEL", "info"),
		// Face biometric services
		FaceBiometricURL: getEnv("FACE_BIOMETRIC_URL", "http://face-biometric:8220"),
		BiasAuditURL:     getEnv("BIAS_AUDIT_SERVICE_URL", "http://face-bias-audit:8230"),
		QdrantURL:        getEnv("QDRANT_URL", "http://qdrant:6333"),
		// NINAuth / NIMC
		NINAuthBaseURL: getEnv("NINAUTH_BASE_URL", "https://ninauth.nimc.gov.ng"),
		NIMCApiURL:     getEnv("NIMC_API_URL", "https://api.nimc.gov.ng/v1"),
		NIMCApiKey:     getEnv("NIMC_API_KEY", ""),
		// MOSIP
		MOSIPPreRegURL:    getEnv("MOSIP_PREREG_BASE_URL", "https://prereg.mosip.net/v1"),
		MOSIPRegProcURL:   getEnv("MOSIP_REGPROC_BASE_URL", "https://regproc.mosip.net/v1"),
		MOSIPIdRepoURL:    getEnv("MOSIP_IDREPO_BASE_URL", "https://idrepo.mosip.net/v1"),
		MOSIPIdaURL:       getEnv("MOSIP_IDA_URL", "https://ida.mosip.net/v1"),
		MOSIPIdaPartnerID: getEnv("MOSIP_IDA_PARTNER_ID", ""),
		MOSIPIdaApiKey:    getEnv("MOSIP_IDA_API_KEY", ""),
		MOSIPIdaMispKey:   getEnv("MOSIP_IDA_MISP_KEY", ""),
		MOSIPCredURL:      getEnv("MOSIP_CREDENTIAL_BASE_URL", "https://credential.mosip.net/v1"),
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func getEnvInt(key string, fallback int) int {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return fallback
}
