// Command migrate-check reports whether the database pointed at by DB_DSN has
// any pending goose migrations. It replaces the previous shell pipeline
// (`goose status | grep Pending`), which parsed goose's stderr text and — under
// `set -e` — silently swallowed real errors (e.g. a failed DB connection) as a
// bare "exit 1". Here we use goose's programmatic provider API (see
// pressly/goose#225), so connection/parse failures surface explicitly and the
// pending check is exact instead of text-matched.
//
// Exit codes:
//
//	0 — no pending migrations, deploy can proceed
//	1 — one or more pending migrations
//	2 — could not determine status (bad DSN, connection error, etc.)
package main

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"os"
	"path/filepath"

	_ "github.com/jackc/pgx/v5/stdlib" // registers the "pgx" database/sql driver
	"github.com/pressly/goose/v3"
)

const migrationsDir = "migrations"

func main() {
	pending, err := check()
	if err != nil {
		// A GitHub Actions error annotation, plus the underlying cause.
		fmt.Printf("::error::could not check pending migrations: %v\n", err)
		os.Exit(2)
	}

	if len(pending) > 0 {
		fmt.Printf("::error::Found %d pending migration(s). Run the 'Run DB Migrations' workflow before deploying, or rerun this workflow with skip_migration_check=true.\n", len(pending))
		for _, name := range pending {
			fmt.Printf("  - %s\n", name)
		}
		os.Exit(1)
	}

	fmt.Println("No pending migrations. Deploy can proceed.")
}

func check() ([]string, error) {
	dsn := os.Getenv("DB_DSN")
	if dsn == "" {
		return nil, errors.New("DB_DSN environment variable is required")
	}

	db, err := sql.Open("pgx", dsn)
	if err != nil {
		return nil, fmt.Errorf("open database: %w", err)
	}
	defer db.Close()

	ctx := context.Background()
	if err := db.PingContext(ctx); err != nil {
		return nil, fmt.Errorf("connect to database: %w", err)
	}

	provider, err := goose.NewProvider(goose.DialectPostgres, db, os.DirFS(migrationsDir))
	if err != nil {
		return nil, fmt.Errorf("initialize goose provider: %w", err)
	}

	statuses, err := provider.Status(ctx)
	if err != nil {
		return nil, fmt.Errorf("read migration status: %w", err)
	}

	var pending []string
	for _, s := range statuses {
		if s.State == goose.StatePending {
			pending = append(pending, filepath.Base(s.Source.Path))
		}
	}
	return pending, nil
}
