.PHONY: help build run test test-unit test-integration migrate-up migrate-down migrate-create docker-up docker-down docker-build generate-mocks clean up-db up-server

include .env

help: ## Show this help message
	@echo 'Usage: make [target]'
	@echo ''
	@echo 'Available targets:'
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  %-20s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

build: ## Build the application
	go build -o bin/server ./cmd/server

run: ## Run the application
	go run cmd/server/main.go

test: ## Run all tests
	go test ./...

test-unit: ## Run unit tests only
	go test -short ./...

test-integration: ## Run integration tests
	go test -tags=integration ./...

migrate-up: ## Run database migrations up
	@if [ -z "$(DB_DSN)" ]; then \
		echo "Error: DB_DSN environment variable is required"; \
		echo "Example: make migrate-up DB_DSN='postgres://user:pass@localhost/dbname?sslmode=disable'"; \
		exit 1; \
	fi
	goose -dir migrations postgres "$(DB_DSN)" up

migrate-down: ## Run database migrations down
	@if [ -z "$(DB_DSN)" ]; then \
		echo "Error: DB_DSN environment variable is required"; \
		echo "Example: make migrate-down DB_DSN='postgres://user:pass@localhost/dbname?sslmode=disable'"; \
		exit 1; \
	fi
	goose -dir migrations postgres "$(DB_DSN)" down

migrate-create: ## Create a new database migration as .sql
	goose -dir migrations create $(NAME) sql

docker-up: ## Start docker containers
	docker compose up -d

docker-down: ## Stop docker containers
	docker compose down

docker-build: ## Build docker image
	docker build -f docker/Dockerfile -t finance-app-backend:latest .

docker-logs: ## Show docker logs
	docker compose logs -f

generate-mocks: ## Generate mocks using mockery
	@if ! command -v mockery > /dev/null; then \
		echo "Installing mockery..."; \
		go install github.com/vektra/mockery/v2@latest; \
	fi
	@echo "Generating mocks..."
	@mockery || (echo "Error generating mocks. Try running: go mod tidy && go mod download" && exit 1)

clean: ## Clean build artifacts
	rm -rf bin/ mocks/
	go clean


up-db: ## Start docker containers for database
	docker compose up -d postgres

up-server: ## Start docker containers for server
	docker compose up backend
