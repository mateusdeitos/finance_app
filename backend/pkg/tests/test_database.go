package tests

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"runtime"

	"github.com/testcontainers/testcontainers-go/modules/postgres"
	gormPostgres "gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"

	_ "github.com/jackc/pgx/v5/stdlib"
	goose "github.com/pressly/goose/v3"
)

type TestDatabase struct {
	Db *gorm.DB
}

func NewTestDatabase(ctx context.Context) (*TestDatabase, error) {
	connStr := os.Getenv("TEST_DB_DSN")
	if connStr == "" {
		postgresContainer, err := postgres.Run(ctx,
			"postgres:15-alpine",
			postgres.WithDatabase("test_db"),
			postgres.WithUsername("test_user"),
			postgres.WithPassword("test_password"),
			postgres.BasicWaitStrategies(),
		)
		if err != nil {
			return nil, err
		}

		connStr, err = postgresContainer.ConnectionString(ctx, "sslmode=disable")
		if err != nil {
			return nil, err
		}
	}

	logLevel := logger.Silent
	if os.Getenv("TEST_DB_LOG_LEVEL") == "info" {
		logLevel = logger.Info
	}

	db, err := gorm.Open(gormPostgres.Open(connStr), &gorm.Config{
		Logger:         logger.Default.LogMode(logLevel),
		TranslateError: true,
	})
	if err != nil {
		return nil, err
	}

	sqlDB, err := sql.Open("pgx", connStr)
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %w", err)
	}

	if err := sqlDB.Ping(); err != nil {
		return nil, err
	}

	migrationsPath, err := findMigrationsPath()
	if err != nil {
		return nil, fmt.Errorf("failed to find migrations directory: %w", err)
	}

	if err := goose.Up(sqlDB, migrationsPath); err != nil {
		return nil, fmt.Errorf("failed to run migrations: %w", err)
	}

	return &TestDatabase{Db: db}, nil
}

// findMigrationsPath finds the migrations directory relative to the backend root.
// It searches for the migrations directory by walking up from the current file location
// or from the current working directory.
func findMigrationsPath() (string, error) {
	// First, try relative to the current file (pkg/tests/test_database.go)
	// Go up 2 levels to reach backend root, then append migrations
	_, currentFile, _, _ := runtime.Caller(0)
	fileDir := filepath.Dir(currentFile)
	backendRoot := filepath.Join(fileDir, "..", "..")
	migrationsPath, err := filepath.Abs(filepath.Join(backendRoot, "migrations"))
	if err != nil {
		return "", fmt.Errorf("failed to resolve migrations path: %w", err)
	}

	if _, err := os.Stat(migrationsPath); err == nil {
		return migrationsPath, nil
	}

	// If that doesn't work, try from current working directory
	wd, err := os.Getwd()
	if err != nil {
		return "", fmt.Errorf("failed to get working directory: %w", err)
	}

	// Walk up from current directory looking for migrations
	current := wd
	for {
		migrationsPath := filepath.Join(current, "migrations")
		if _, err := os.Stat(migrationsPath); err == nil {
			absPath, err := filepath.Abs(migrationsPath)
			if err != nil {
				return "", fmt.Errorf("failed to resolve migrations path: %w", err)
			}
			return absPath, nil
		}

		parent := filepath.Dir(current)
		if parent == current {
			// Reached root
			break
		}
		current = parent
	}

	return "", fmt.Errorf("migrations directory not found (searched from %s and %s)", fileDir, wd)
}
