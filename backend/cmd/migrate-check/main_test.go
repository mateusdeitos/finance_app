package main

import (
	"testing"

	"github.com/jackc/pgx/v5"
)

func TestOpenDatabaseUsesSimpleProtocol(t *testing.T) {
	config, err := databaseConfig("postgres://user:password@localhost:5432/finance_app?sslmode=disable")
	if err != nil {
		t.Fatalf("databaseConfig() error = %v", err)
	}

	if config.DefaultQueryExecMode != pgx.QueryExecModeSimpleProtocol {
		t.Fatalf("query execution mode = %v, want simple protocol", config.DefaultQueryExecMode)
	}
}
