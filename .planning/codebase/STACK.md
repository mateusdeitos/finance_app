# Technology Stack

**Analysis Date:** 2026-04-09

## Languages

**Primary:**
- Go 1.24.4 - Core backend service

## Runtime

**Environment:**
- Docker 28.5+ - Local development and production deployment
- Google Cloud Run - Production deployment target

**Package Manager:**
- Go modules (go.mod/go.sum)
- Lockfile: Present (`go.sum`)

## Frameworks

**Core:**
- Echo v4.13.4 - HTTP web framework for REST API endpoints
- GORM v1.31.1 - ORM for database operations
- Goth v1.82.0 - OAuth authentication provider abstraction

**Testing:**
- Testify v1.11.1 - Assertion library for unit and integration tests
- Testcontainers v0.40.0 - Containerized PostgreSQL instances for integration tests

**Build/Dev:**
- Goose v3.26.0 - Database migration tool (timestamped SQL migrations)
- Mockery v2 - Mock code generation from interfaces
- Swag v1.16.2 - Swagger/OpenAPI documentation generation from annotations
- golangci-lint - Multi-linter runner for code quality

**Database:**
- PostgreSQL v15-alpine - Primary data store (via Docker)
- github.com/jackc/pgx/v5 - PostgreSQL driver for pgx (indirect via GORM)

## Key Dependencies

**Critical:**
- github.com/golang-jwt/jwt/v5 v5.3.0 - JWT token generation and validation for authentication
- github.com/labstack/echo/v4 v4.13.4 - HTTP routing, middleware, request/response handling
- gorm.io/driver/postgres v1.6.0 - PostgreSQL driver for GORM
- gorm.io/gorm v1.31.1 - ORM with migrations, relationships, query building

**OAuth & Auth:**
- github.com/markbates/goth v1.82.0 - OAuth provider abstraction (Google, Microsoft)
- github.com/gorilla/sessions v1.1.1 - Session management for OAuth state
- github.com/gorilla/securecookie v1.1.1 - Secure cookie encryption

**Infrastructure:**
- github.com/joho/godotenv v1.5.1 - Environment variable loading from `.env` files
- cloud.google.com/go/compute/metadata v0.9.0 - Google Cloud metadata service integration
- github.com/pressly/goose/v3 v3.26.0 - SQL migration runner and management

**Utilities:**
- github.com/samber/lo v1.52.0 - Functional programming utilities (map, filter, etc.)
- golang.org/x/oauth2 v0.33.0 - OAuth2 protocol implementation (indirect)

**Testing Infrastructure:**
- github.com/testcontainers/testcontainers-go v0.40.0 - Containerized test dependencies
- github.com/testcontainers/testcontainers-go/modules/postgres v0.40.0 - PostgreSQL container for integration tests

## Configuration

**Environment:**
- `.env` file loading via `github.com/joho/godotenv`
- Configuration struct in `internal/config/config.go` with getEnv() helpers
- Environment variables with fallback defaults:
  - **Server:** `SERVER_HOST`, `SERVER_PORT`
  - **Database:** `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_SSLMODE`
  - **JWT:** `JWT_SECRET`, `JWT_EXPIRATION_HOURS`
  - **OAuth (Google):** `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`
  - **OAuth (Microsoft):** `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_CALLBACK_URL`
  - **OAuth Session:** `OAUTH_SESSION_SECRET`
  - **Application:** `APP_URL`, `FRONTEND_URL`, `ENV`

**Build:**
- `justfile` - Task runner for common operations (tests, migrations, docs generation, linting)
- `.golangci.yml` - Linter configuration with customized thresholds for complexity, line length, etc.
- Docker Compose v3.8 - Multi-container orchestration for local development

## Platform Requirements

**Development:**
- Go 1.24.4+
- Docker & Docker Compose
- PostgreSQL 15 (via container)
- `just` command runner (justfile execution)
- `goose` - Database migration CLI
- `golangci-lint` - Linter (auto-installed by justfile)
- `swag` - Swagger documentation generator (auto-installed by justfile)
- `mockery` - Mock generator (auto-installed by justfile)

**Production:**
- Google Cloud Run (containerized Go service)
- PostgreSQL database (Cloud SQL or external)
- OAuth credentials from Google and/or Microsoft
- TLS/HTTPS enforcement by Cloud Run

---

*Stack analysis: 2026-04-09*
