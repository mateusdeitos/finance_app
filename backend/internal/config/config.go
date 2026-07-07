package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/joho/godotenv"
)

type Config struct {
	Server        ServerConfig
	Database      DatabaseConfig
	JWT           JWTConfig
	OAuth         OAuthConfig
	App           AppConfig
	VAPID         VAPIDConfig
	Impersonation ImpersonationConfig
}

type ServerConfig struct {
	Port string
	Host string
}

type DatabaseConfig struct {
	Host     string
	Port     string
	User     string
	Password string
	Name     string
	SSLMode  string
}

func (d DatabaseConfig) DSN() string {
	return fmt.Sprintf("host=%s port=%s user=%s password=%s dbname=%s sslmode=%s",
		d.Host, d.Port, d.User, d.Password, d.Name, d.SSLMode)
}

type JWTConfig struct {
	Secret          string
	ExpirationHours int
}

func (j JWTConfig) Expiration() time.Duration {
	return time.Duration(j.ExpirationHours) * time.Hour
}

type OAuthConfig struct {
	Google        OAuthProviderConfig
	Microsoft     OAuthProviderConfig
	SessionSecret string
}

type OAuthProviderConfig struct {
	ClientID     string
	ClientSecret string
	CallbackURL  string
}

type AppConfig struct {
	URL            string
	FrontendURL    string
	AllowedOrigins []string
	Env            string
	LogLevel       string
}

type VAPIDConfig struct {
	PublicKey  string // VAPID_PUBLIC_KEY  — base64url-encoded uncompressed EC P-256 point
	PrivateKey string // VAPID_PRIVATE_KEY — corresponding private scalar
	Subject    string // VAPID_SUBJECT     — "mailto:..." per RFC 8292
}

// ImpersonationConfig controls the admin user-impersonation feature.
type ImpersonationConfig struct {
	// TokenTTLMinutes bounds how long an impersonation token stays valid.
	// Kept short by design: impersonation is for a troubleshooting session,
	// not a standing grant.
	TokenTTLMinutes int
}

func (i ImpersonationConfig) TokenTTL() time.Duration {
	return time.Duration(i.TokenTTLMinutes) * time.Minute
}

func Load(files ...string) (*Config, error) {
	// Try to load .env file, but don't fail if it doesn't exist
	_ = godotenv.Load(files...)

	config := &Config{
		Server: ServerConfig{
			Port: getEnv("SERVER_PORT", "8080"),
			Host: getEnv("SERVER_HOST", "0.0.0.0"),
		},
		Database: DatabaseConfig{
			Host:     getEnv("DB_HOST", "localhost"),
			Port:     getEnv("DB_PORT", "5432"),
			User:     getEnv("DB_USER", "postgres"),
			Password: getEnv("DB_PASSWORD", "postgres"),
			Name:     getEnv("DB_NAME", "finance_app"),
			SSLMode:  getEnv("DB_SSLMODE", "disable"),
		},
		JWT: JWTConfig{
			Secret:          getEnv("JWT_SECRET", "change-me-in-production"),
			ExpirationHours: getEnvAsInt("JWT_EXPIRATION_HOURS", 24),
		},
		OAuth: OAuthConfig{
			Google: OAuthProviderConfig{
				ClientID:     getEnv("GOOGLE_CLIENT_ID", ""),
				ClientSecret: getEnv("GOOGLE_CLIENT_SECRET", ""),
				CallbackURL:  getEnv("GOOGLE_CALLBACK_URL", "http://localhost:8080/auth/google/callback"),
			},
			Microsoft: OAuthProviderConfig{
				ClientID:     getEnv("MICROSOFT_CLIENT_ID", ""),
				ClientSecret: getEnv("MICROSOFT_CLIENT_SECRET", ""),
				CallbackURL:  getEnv("MICROSOFT_CALLBACK_URL", "http://localhost:8080/auth/microsoft/callback"),
			},
			SessionSecret: getEnv("OAUTH_SESSION_SECRET", "change-me-in-production"),
		},
		App: AppConfig{
			URL:            getEnv("APP_URL", "http://localhost:8080"),
			FrontendURL:    getEnv("FRONTEND_URL", "http://localhost:3000"),
			AllowedOrigins: parseCSV(getEnv("ALLOWED_ORIGINS", "")),
			Env:            getEnv("ENV", "development"),
			LogLevel:       getEnv("LOG_LEVEL", "info"),
		},
		VAPID: VAPIDConfig{
			PublicKey:  getEnv("VAPID_PUBLIC_KEY", ""),
			PrivateKey: getEnv("VAPID_PRIVATE_KEY", ""),
			Subject:    getEnv("VAPID_SUBJECT", ""),
		},
		Impersonation: ImpersonationConfig{
			TokenTTLMinutes: getEnvAsInt("IMPERSONATION_TOKEN_TTL_MINUTES", 30),
		},
	}

	return config, nil
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func getEnvAsInt(key string, defaultValue int) int {
	valueStr := getEnv(key, "")
	if value, err := strconv.Atoi(valueStr); err == nil {
		return value
	}
	return defaultValue
}

func parseCSV(value string) []string {
	if value == "" {
		return nil
	}
	parts := strings.Split(value, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if trimmed := strings.TrimSpace(p); trimmed != "" {
			out = append(out, trimmed)
		}
	}
	return out
}
