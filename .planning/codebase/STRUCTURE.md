# Codebase Structure

**Analysis Date:** 2026-04-09

## Directory Layout

```
backend/
├── cmd/
│   └── server/
│       └── main.go               # Application entry point: config, DI, server setup
├── internal/
│   ├── application/              # [TODO: Purpose unclear from code]
│   ├── config/
│   │   └── config.go             # Config loading from environment
│   ├── domain/                   # Domain models and business types
│   │   ├── account.go
│   │   ├── category.go
│   │   ├── settlement.go
│   │   ├── tag.go
│   │   ├── transaction.go        # Central domain: TransactionType, RecurrenceType, etc.
│   │   ├── transaction_import.go # CSV import structures
│   │   ├── user.go
│   │   ├── user_connection.go    # User relationships and split defaults
│   │   └── user_settings.go
│   ├── entity/                   # GORM ORM structs with ToDomain/FromDomain converters
│   │   ├── account.go
│   │   ├── category.go
│   │   ├── settlement.go
│   │   ├── tag.go
│   │   ├── transaction.go
│   │   ├── user.go
│   │   ├── user_connection.go
│   │   ├── user_settings.go
│   │   └── usersocial.go
│   ├── handler/                  # Echo HTTP handlers with Swagger annotations
│   │   ├── account_handler.go
│   │   ├── auth_handler.go
│   │   ├── category_handler.go
│   │   ├── docs_handler.go       # Swagger UI routing
│   │   ├── tag_handler.go
│   │   ├── transaction_handler.go
│   │   └── user_connection_handler.go
│   ├── middleware/
│   │   ├── auth.go               # JWT/cookie extraction and context injection
│   │   └── error_handler.go      # Standardized error response formatting
│   ├── repository/               # Data access layer
│   │   ├── interfaces.go         # All repository interface definitions; Repositories struct
│   │   ├── account_repository.go
│   │   ├── category_repository.go
│   │   ├── db_transaction.go     # Database transaction management
│   │   ├── settlement_repository.go
│   │   ├── tag_repository.go
│   │   ├── transaction_recurrence_repository.go
│   │   ├── transaction_repository.go
│   │   ├── user_connection_repository.go
│   │   ├── user_repository.go
│   │   ├── user_settings_repository.go
│   │   └── user_social_repository.go
│   └── service/                  # Business logic layer
│       ├── interfaces.go         # All service interface definitions; Services struct
│       ├── structs.go            # Services struct definition and factory-like init
│       ├── auth_service.go
│       ├── account_service.go
│       ├── category_service.go
│       ├── tag_service.go
│       ├── transaction_service.go           # Delegates to specific files
│       ├── transaction_create.go            # Transaction creation logic
│       ├── transaction_update.go            # Transaction update logic
│       ├── transaction_delete.go            # Transaction deletion with propagation
│       ├── transaction_balance.go           # Balance calculation
│       ├── transaction_import.go            # CSV import parsing
│       ├── user_connection_service.go
│       ├── settlement_service.go
│       ├── user_service.go
│       ├── test_setup.go         # Unit test infrastructure with mocks
│       └── test_setup_with_db.go # Integration test infrastructure with real DB
├── pkg/                          # Cross-cutting utilities
│   ├── appcontext/
│   │   └── appcontext.go         # Context helpers: WithUser, GetUserFromContext, etc.
│   ├── database/
│   │   └── database.go           # PostgreSQL connection setup via GORM
│   ├── errors/
│   │   └── errors.go             # Error codes, tags, ServiceError type, ToHTTPError converter
│   ├── oauth/
│   │   └── oauth.go              # OAuth provider setup (Google/Microsoft)
│   └── tests/
│       └── testhelpers.go        # Testing utilities
├── mocks/                        # Auto-generated mocks via mockery (never edit)
│   └── mock_*.go                 # One per repository/service interface
├── migrations/                   # Goose SQL migrations (timestamped filenames)
│   ├── 00001_initial_schema.up.sql
│   ├── 20260109123226_timestamp_with_timezone.sql
│   ├── 20260213002403_add_column_type_transaction_recurrence.sql
│   ├── 20260309000000_create_settlements_table.sql
│   └── ...
├── docs/                         # Generated Swagger/OpenAPI documentation
│   ├── swagger.json
│   └── swagger.yaml
├── docker/                       # Docker-related files
├── docker-compose.yml            # PostgreSQL + services
├── justfile                      # Task runner (like Makefile)
├── go.mod                        # Go module definition
├── go.sum                        # Go module checksums
├── .golangci.yml                 # Lint configuration
├── .mockery.yaml                 # Mock generation configuration
├── .env.example                  # Example environment variables
└── README.md                     # Project documentation
```

## Directory Purposes

**cmd/server/:**
- Purpose: Application entry point and dependency injection setup
- Contains: Single main.go file orchestrating server startup
- Key files: `main.go` loads config, initializes repos/services, registers routes, starts Echo

**internal/domain/:**
- Purpose: Core business models independent of storage or transport
- Contains: Pure Go types representing business concepts (Transaction, Account, User, etc.)
- Key files:
  - `transaction.go` - Central domain with TransactionType, RecurrenceType, RecurrenceSettings, SplitSettings enums and structs
  - `user_connection.go` - User relationships, default split percentages, account IDs per user
  - `settlement.go` - Debt/credit tracking for shared expenses

**internal/entity/:**
- Purpose: GORM ORM structs mapping database schema
- Contains: Struct definitions with GORM tags, soft delete support, relationship definitions
- Key pattern: Each entity has `ToDomain()` (entity → domain) and `*FromDomain()` (domain → entity) conversion methods

**internal/handler/:**
- Purpose: Accept HTTP requests, validate input, call services, format responses
- Contains: Echo handlers with Swagger annotations for documentation
- Pattern: One handler per resource (AccountHandler, CategoryHandler, etc.), injected with service dependencies
- Naming: `*Handler` struct with method per HTTP operation (Create, Search, Update, Delete, etc.)

**internal/middleware/:**
- Purpose: Cross-cutting HTTP concerns (authentication, error handling)
- Contains: Auth middleware for JWT validation and user context injection; error handler for standardized responses
- Key files:
  - `auth.go` - AuthMiddleware: extracts token, validates, injects user into context
  - `error_handler.go` - ErrorHandler: standardizes error responses with code, message, tags

**internal/repository/:**
- Purpose: Data access abstraction layer
- Contains: Repository interface definitions and GORM-based implementations
- Key files:
  - `interfaces.go` - All repository interfaces and `Repositories` struct holding all implementations
  - `transaction_repository.go` - Complex queries: search with filters, balance calculations, soft deletes
  - Other `*_repository.go` - One per resource
- Pattern: Repositories return entity models (from `internal/entity/`); conversion to domain happens in this layer

**internal/service/:**
- Purpose: Business logic orchestration and validation
- Contains: Service implementations split by domain and operation type
- Key files:
  - `interfaces.go` - All service interfaces and `Services` struct
  - `transaction_*.go` - Transaction operations split: create, update, delete, balance, import (complex logic)
  - Other `*_service.go` - Simpler services: Account, Category, Tag, User, UserConnection, Settlement, Auth
  - `test_setup.go` - Unit test infrastructure with mocks
  - `test_setup_with_db.go` - Integration test infrastructure with real PostgreSQL via testcontainers
- Pattern: Services depend on repositories via interfaces; some services depend on other services (TransactionService calls AccountService, SettlementService)

**internal/config/:**
- Purpose: Environment-based configuration loading
- Contains: Config struct with nested types (Server, Database, JWT, OAuth, App)
- Key file: `config.go` loads from environment variables with sensible defaults

**internal/middleware/ (cross-cutting):**
- Purpose: HTTP request/response processing
- Auth: Token extraction from Authorization header or auth_token cookie; user context injection
- Error: Standardized ErrorResponse with error code, message, optional tags

**pkg/appcontext/:**
- Purpose: Context helper functions for request-scoped user data
- Contains: Functions to inject (WithUser, WithUserID) and retrieve (GetUserFromContext, GetUserIDFromContext) from context
- Pattern: Handlers and services use these to thread user through request lifecycle

**pkg/errors/:**
- Purpose: Structured error system for application-level error handling
- Contains: ErrorCode enum, ErrorTag enum, ServiceError type, ToHTTPError converter
- Key features:
  - ErrorCode: NOT_FOUND, VALIDATION_ERROR, FORBIDDEN, INTERNAL_ERROR, UNAUTHORIZED, etc.
  - ErrorTag: Fine-grained categories (TRANSACTION.AMOUNT_MUST_BE_GREATER_THAN_ZERO, etc.)
  - ServiceError: Contains code, tags, message
  - ToHTTPError: Converts ServiceError to HTTP response

**pkg/database/:**
- Purpose: Database connection management
- Contains: PostgreSQL GORM connection setup
- Key file: `database.go` creates GORM DB instance

**pkg/oauth/:**
- Purpose: OAuth provider configuration (Google/Microsoft via Goth)
- Contains: Provider setup and initialization
- Enabled only when ClientID/ClientSecret are set in config

**pkg/tests/:**
- Purpose: Testing utilities and helpers
- Contains: Shared test infrastructure (not yet heavily populated)

**mocks/:**
- Purpose: Auto-generated mock implementations of repository/service interfaces
- Pattern: Auto-generated via mockery from interface definitions; never edit manually
- Naming: `mock_*` for each interface (e.g., `mock_TransactionRepository.go`, `mock_AccountService.go`)
- Regenerate: Run `just generate-mocks` after adding new repository/service interfaces

**migrations/:**
- Purpose: Versioned database schema changes
- Pattern: Goose migration files, timestamped (20260109_*, 20260213_*, etc.)
- Each file contains SQL to add/modify tables and constraints
- Naming: `YYYYMMDDHHMMSS_description.up.sql` for up migrations

**docs/:**
- Purpose: Generated OpenAPI/Swagger documentation
- Contains: swagger.json and swagger.yaml
- Generated from: Handler Swagger annotations via `just generate-docs`
- Served at: `/swagger/` endpoint for interactive API exploration

## Key File Locations

**Entry Points:**
- `cmd/server/main.go`: Application startup, DI setup, route registration

**Configuration:**
- `internal/config/config.go`: Environment variable loading

**Core Logic:**
- `internal/domain/transaction.go`: Transaction domain model with types and validation
- `internal/service/transaction_*.go`: Transaction business logic (split across create, update, delete, balance, import)
- `internal/service/interfaces.go`: All service interface contracts

**Data Access:**
- `internal/repository/interfaces.go`: All repository interface contracts
- `internal/repository/transaction_repository.go`: Transaction queries and persistence

**HTTP Layer:**
- `internal/handler/*_handler.go`: HTTP request handling per resource
- `internal/middleware/auth.go`: Authentication middleware
- `internal/middleware/error_handler.go`: Error response formatting

**Testing:**
- `internal/service/test_setup.go`: Mock-based unit test infrastructure
- `internal/service/test_setup_with_db.go`: Real database integration test infrastructure

## Naming Conventions

**Files:**
- Domain models: `internal/domain/{concept}.go` (e.g., `transaction.go`, `account.go`)
- Entities: `internal/entity/{concept}.go` matching domain files
- Repositories: `internal/repository/{concept}_repository.go` (e.g., `account_repository.go`)
- Services: `internal/service/{concept}_service.go` (e.g., `auth_service.go`) with special split for Transaction (create/update/delete/balance/import)
- Handlers: `internal/handler/{concept}_handler.go` (e.g., `account_handler.go`)
- Tests: `{related_file}_test.go` co-located with source (e.g., `transaction_service_test.go` next to `transaction_*.go` files)
- Migrations: `migrations/YYYYMMDDHHMMSS_{description}.sql` or `.up.sql` for Goose

**Directories:**
- Layered by concern: `internal/{layer}/` (domain, entity, handler, service, repository, middleware, config)
- Cross-cutting utilities: `pkg/{concern}/` (appcontext, database, errors, oauth, tests)
- Source organization follows domain concepts, not architectural layers (e.g., all transaction-related code shares `transaction_*` naming)

**Types:**
- Enums as named string types: `type TransactionType string` with const values (not iota)
- Request/response types: `{Concept}CreateRequest`, `{Concept}UpdateRequest` in domain package
- Filter/search types: `{Concept}Filter`, `{Concept}SearchOptions` with optional fields
- Interfaces: Defined once in `interfaces.go` per package, no spreading across files

**Functions:**
- Constructor/factory: `New{Type}()`, `New{Type}Repository()`, `New{Type}Handler()`
- Getters: `Get{Field}()` or just direct field access
- Checkers: `Is{Property}()`, `IsValid()` for validation
- Converters: `ToDomain()` (entity→domain), `{Type}FromDomain()` (domain→entity)

**Constants:**
- Error codes: `ErrCode{Name}` (e.g., `ErrCodeNotFound`)
- Error tags: `ErrorTag{Name}` (e.g., `ErrorTagAmountMustBeGreaterThanZero`)
- Error instances: `Err{Name}` (e.g., `ErrAmountMustBeGreaterThanZero`)

## Where to Add New Code

**New Domain Concept (e.g., Budget):**
1. Create `internal/domain/budget.go` with domain structs and enums
2. Create `internal/entity/budget.go` with GORM structs and conversion methods
3. Create `internal/repository/budget_repository.go` with GORM queries
4. Create `internal/repository/interfaces.go` - add `BudgetRepository` interface
5. Create `internal/service/budget_service.go` with business logic
6. Add `BudgetService` interface to `internal/service/interfaces.go`
7. Create `internal/handler/budget_handler.go` with HTTP handlers
8. Register handler and routes in `cmd/server/main.go`
9. Create migrations in `migrations/` for new tables
10. Create/update mocks: `just generate-mocks`
11. Add tests next to implementation files (e.g., `budget_service_test.go`)

**New Repository Method:**
1. Add method to repository interface in `internal/repository/interfaces.go`
2. Implement in `internal/repository/{concept}_repository.go`
3. Run `just generate-mocks` to regenerate mock
4. Call from service or test

**New Service Method:**
1. Add method to service interface in `internal/service/interfaces.go`
2. Implement in `internal/service/{concept}_service.go` (or new file if complex, like `transaction_balance.go`)
3. Run `just generate-mocks` to regenerate mock
4. Call from handler or other service

**New HTTP Endpoint:**
1. Add method to handler in `internal/handler/{concept}_handler.go`
2. Add Swagger annotations to handler method
3. Register route in `cmd/server/main.go` under appropriate group (api/accounts, api/transactions, etc.)
4. Run `just generate-docs` to update OpenAPI spec

**New Validation/Error:**
1. Add `ErrorTag` const to `pkg/errors/errors.go`
2. Add predefined error variable (e.g., `ErrMyValidation`)
3. Use in service validation: return `ErrMyValidation` with `.WithTag()` if needed
4. Client receives in error response `tags` array for UI guidance

**Integration Test:**
1. Create `{concept}_test.go` in `internal/service/`
2. Embed `ServiceTestWithDBSuite` from `test_setup_with_db.go`
3. Use helper methods: `createTestUser()`, `createTestAccount()`, `createTestCategory()`, etc.
4. Run via `just test-integration` or `go test ./internal/service/ -tags=integration`

## Special Directories

**migrations/:**
- Purpose: Versioned database schema
- Generated: No, written manually
- Committed: Yes, tracked in git for reproducible deployments
- Naming: Goose format `YYYYMMDDHHMMSS_{description}.sql`
- Usage: Applied via `just migrate-up` with `DB_DSN` environment variable

**docs/:**
- Purpose: Generated OpenAPI/Swagger documentation
- Generated: Yes, via `just generate-docs` from handler Swagger comments
- Committed: Yes, for API documentation in git/PR reviews
- Served: At `/swagger/` endpoint via Echo

**mocks/:**
- Purpose: Auto-generated test doubles
- Generated: Yes, via `just generate-mocks` from repository/service interfaces
- Committed: Yes, to keep tests deterministic
- Pattern: Never edit manually; always regenerate when interfaces change

**docker/:**
- Purpose: Docker image and configuration files
- Generated: No, written manually
- Committed: Yes

---

*Structure analysis: 2026-04-09*
