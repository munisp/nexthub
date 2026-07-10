// Package config loads bridge configuration from environment variables.
package config

import (
	"os"
	"strconv"
)

// Config holds all runtime configuration for the bridge service.
type Config struct {
	Port             string
	InternalKey      string
	DatabaseURL      string
	KafkaBrokers     string
	RedisAddr        string
	TemporalHost     string
	TemporalNamespace string
	PermifyEndpoint  string
	PermifyToken     string
	KeycloakURL      string
	KeycloakRealm    string
	KeycloakClientID string
	KeycloakSecret   string
	TigerBeetleAddr  string
	LakehouseURL     string
	JWTSecret        string
	LogLevel         string
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
