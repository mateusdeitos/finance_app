package config

import (
	"fmt"
	"os"
	"strconv"
	"time"

	"github.com/joho/godotenv"
)

type Config struct {
	Server   ServerConfig
	Database DatabaseConfig
	JWT      JWTConfig
	OAuth    OAuthConfig
	App      AppConfig
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
	Secret         string
	ExpirationHours int
}

func (j JWTConfig) Expiration() time.Duration {
	return time.Duration(j.ExpirationHours) * time.Hour
}

type OAuthConfig struct {
	Google    OAuthProviderConfig
	Microsoft OAuthProviderConfig
	SessionSecret string
}

type OAuthProviderConfig struct {
	ClientID     string
	ClientSecret string
	CallbackURL  string
}

type AppConfig struct {
	URL string
	Env string
}

func Load() (*Config, error) {
	// Try to load .env file, but don't fail if it doesn't exist
	_ = godotenv.Load()

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
			URL: getEnv("APP_URL", "http://localhost:8080"),
			Env: getEnv("ENV", "development"),
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

