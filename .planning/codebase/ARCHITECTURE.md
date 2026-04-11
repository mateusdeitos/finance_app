# Architecture

**Analysis Date:** 2026-04-09

## Pattern Overview

**Overall:** Layered/Onion Architecture with Dependency Injection

**Key Characteristics:**
- Four-layer architecture: HTTP handlers → Services → Repositories → PostgreSQL
- Dependency injection via constructor-based DI (no IoC container)
- Separation of concerns: Domain models, entity models, service interfaces, and implementations are strictly separated
- Domain-driven design with rich domain models and explicit business operations
- Interface-first design for repositories and services enabling testability and mock generation

## Layers

**HTTP Handler Layer:**
- Purpose: Accept HTTP requests, extract parameters, call services, return responses
- Location: `internal/handler/`
- Contains: Echo HTTP handlers with Swagger/OpenAPI annotations (`@Summary`, `@Tags`, `@Security`, etc.)
- Depends on: Service interfaces from `internal/service/interfaces.go`, domain models, appcontext helpers, error conversion
- Used by: Echo routing engine, directly receives HTTP requests
- Key file: `cmd/server/main.go` - Sets up all handlers, services, repositories, and Echo routes

**Service Layer:**
- Purpose: Business logic, orchestration, validation, transaction propagation, recurrence handling
- Location: `internal/service/`
- Contains: Service implementations split by domain (Account, Category, Tag, Transaction, User, UserConnection, Settlement, Auth)
- Depends on: Repository interfaces from `internal/repository/interfaces.go`, domain models, appcontext, error utilities
- Used by: HTTP handlers via service interfaces
- Key files:
  - `service/interfaces.go` - All service interface definitions
  - `service/transaction_*.go` - Complex transaction operations split across Create, Update, Delete, Balance, Import
  - `service/structs.go` - Service struct with all service fields for dependency injection
  - `service/test_setup_with_db.go` - Integration test infrastructure with real PostgreSQL

**Repository Layer:**
- Purpose: Data persistence abstraction, query construction, database operations
- Location: `internal/repository/`
- Contains: Repository interface definitions and GORM-based implementations
- Depends on: Entity models from `internal/entity/`, domain models, database connection (GORM)
- Used by: Services via repository interfaces
- Key files:
  - `repository/interfaces.go` - All repository interface definitions; `Repositories` struct holds all impls
  - `repository/*_repository.go` - Implementation per domain (User, Account, Transaction, etc.)
  - `repository/db_transaction.go` - Database transaction management for distributed business operations

**Entity Layer:**
- Purpose: GORM ORM structs with database mapping and domain conversion
- Location: `internal/entity/`
- Contains: Struct definitions with GORM tags, soft delete support, relationships
- Depends on: Domain models, GORM library
- Used by: Repositories for database operations
- Key pattern: Each entity has `ToDomain()` (entity → domain model) and `FromDomain()` (domain → entity) methods for layer translation

**Domain Layer:**
- Purpose: Core business models, types, enums, validation rules
- Location: `internal/domain/`
- Contains: Pure data structures representing business concepts (Transaction, Account, Category, User, etc.)
- Depends on: Standard library only
- Used by: All upper layers; represents the ubiquitous language of the system
- Key files:
  - `domain/transaction.go` - Central domain with types (TransactionType: expense/income/transfer), RecurrenceSettings, SplitSettings
  - `domain/user_connection.go` - User relationship and split defaults
  - `domain/settlement.go` - Debt/credit tracking for shared expenses

**Configuration Layer:**
- Purpose: Load and provide environment-based configuration
- Location: `internal/config/config.go`
- Contains: Config struct with nested sections (Server, Database, JWT, OAuth, App)
- Used by: Main entry point to configure all downstream services

**Middleware & Cross-Cutting:**
- Location: `internal/middleware/`
- Auth Middleware: Extracts JWT from `Authorization: Bearer` header or `auth_token` cookie, validates token, injects user into context via `appcontext` helpers
- Error Handler: Standardized error response with `error` (code), `message` fields, and optional `tags` array for fine-grained client error handling
- Cross-cutting via utilities in `pkg/`:
  - `pkg/appcontext/` - Context helper functions (`WithUser`, `GetUserFromContext`, `WithUserID`, `GetUserIDFromContext`)
  - `pkg/errors/` - Custom error system with `ErrorCode`, `ErrorTag`, `ServiceError`, and `ToHTTPError()` converter
  - `pkg/database/` - PostgreSQL connection management via GORM
  - `pkg/oauth/` - OAuth provider setup (Google/Microsoft via Goth)

## Data Flow

**Standard Request Flow:**

1. HTTP Request arrives at Echo router
2. CORS middleware validates origin
3. Logger and Recover middleware track request
4. AuthMiddleware extracts JWT/cookie token
5. AuthMiddleware calls `AuthService.ValidateToken()` to get User
6. AuthMiddleware injects user and userID into request context
7. Route handler (e.g., `AccountHandler.Create`) is invoked
8. Handler extracts userID from context via `appcontext.GetUserIDFromContext()`
9. Handler binds request body to domain struct
10. Handler calls service method passing context and userID (for authorization)
11. Service validates business rules, applies domain logic
12. Service calls repository methods to persist/query data
13. Repository executes GORM queries, returns domain entities (converted via `ToDomain()`)
14. Service returns result to handler
15. Handler returns JSON response with HTTP status code
16. ErrorHandler catches any error and returns standardized ErrorResponse

**Transaction Creation Flow (Complex Example):**

1. POST `/api/transactions` with `TransactionCreateRequest`
2. Handler extracts userID from context
3. Handler calls `TransactionService.Create(ctx, userID, request)`
4. Service validates: amount > 0, date present, account exists, transaction type valid
5. If recurrence: Service calculates installment count from recurrence settings
6. If split (expense only): Service validates split percentages/amounts sum correctly
7. Service creates main transaction entity via `TransactionRepository.Create()`
8. If transfer: Service creates linked transaction for destination account, stores relationship in `linked_transactions` table
9. If split: Service creates settlement records linking original transaction to each split participant
10. Service returns transaction ID to handler
11. Handler returns 201 with created transaction

**Search/Filter Flow:**

1. GET `/api/transactions?userID=1&type=expense&startDate=2026-01-01`
2. Handler extracts query parameters, builds `TransactionFilter` domain struct
3. Handler calls `TransactionService.Search(ctx, userID, period, filter)`
4. Service applies period time bounds to filter
5. Service calls `TransactionRepository.Search(ctx, filter)` with filter
6. Repository constructs GORM query: joins Account, Category, Tags; applies filters; adds sorting/pagination
7. Repository returns slice of entities, converts each to domain via `ToDomain()`
8. Service returns domain transactions to handler
9. Handler returns JSON array with 200

**State Management:**

- User state: Injected via middleware into context; extracted by handlers/services
- Request-scoped state: Passed explicitly through function parameters and context
- Database state: Managed by repositories and persisted to PostgreSQL
- Transaction state: Database transactions wrapped by `DBTransaction` repository for operations requiring atomicity
- OAuth state: Stored in session via Goth library during OAuth flow

## Key Abstractions

**Repository Pattern:**
- Purpose: Abstract database operations from business logic
- Examples: `TransactionRepository`, `AccountRepository`, `UserRepository` in `internal/repository/`
- Pattern: Interface definition in `repository/interfaces.go`, implementation in `repository/*_repository.go`, aggregation in `Repositories` struct
- Benefit: Easy mocking for unit tests, switchable persistence implementations

**Service Pattern:**
- Purpose: Encapsulate business logic and coordinate repositories
- Examples: `TransactionService`, `AccountService`, `AuthService` in `internal/service/`
- Pattern: Interface definition in `service/interfaces.go`, implementation often split across multiple files per domain (e.g., `transaction_create.go`, `transaction_update.go`, `transaction_delete.go`), aggregation in `Services` struct
- Cross-service dependency: `TransactionService` and `UserConnectionService` depend on `Services` struct itself for calling other services

**Domain Models:**
- Purpose: Pure business representation independent of storage/transport
- Examples: `Transaction`, `Account`, `User`, `UserConnection` in `internal/domain/`
- Pattern: Rich types with validation methods (e.g., `TransactionType.IsValid()`, `RecurrenceType.IsValid()`)
- Enums as types: Uses string-based enums with validation rather than iota constants for clarity

**Filter/Search Options:**
- Purpose: Flexible, extensible filtering without method overloading
- Pattern: Structs like `TransactionFilter`, `AccountSearchOptions`, `TagSearchOptions` with optional fields
- Generic support: `ComparableSearch[T]` for flexible comparisons (greater than, less than, equal)
- Pagination: `SortBy`, `Limit`, `Offset` fields in filter structs

**Context Injection:**
- Purpose: Pass request-scoped data (user, userID) without threading through function parameters
- Implementation: `pkg/appcontext/` with `WithUser`, `GetUserFromContext`, etc.
- Pattern: Each request context enhanced with middleware, then helpers retrieve values

**Error System:**
- Purpose: Structured, tagged errors for fine-grained client error handling
- Types: `ErrorCode` enum (NOT_FOUND, VALIDATION_ERROR, etc.), `ErrorTag` enum for detailed tags, `ServiceError` struct
- Conversion: `pkg/errors.ToHTTPError()` transforms `ServiceError` to HTTP response with code and message
- Tags usage: Client can inspect `tags` array to determine specific validation failure (e.g., "TRANSACTION.AMOUNT_MUST_BE_GREATER_THAN_ZERO")

## Entry Points

**HTTP Entry Point:**
- Location: `cmd/server/main.go`
- Triggers: Application startup
- Responsibilities:
  1. Load environment configuration via `config.Load()`
  2. Set timezone to UTC
  3. Connect to PostgreSQL database
  4. Initialize all repositories with database connection
  5. Initialize all services with repository dependencies
  6. Wire cross-service dependencies (TransactionService, UserConnectionService)
  7. Initialize all HTTP handlers with services
  8. Setup Echo HTTP server with middleware (CORS, logging, recover, auth)
  9. Register routes grouped by resource (accounts, categories, tags, transactions, user-connections)
  10. Start listening on configured host:port
  11. Graceful shutdown on interrupt signal

**OAuth Entry Point:**
- Location: `internal/handler/auth_handler.go` - OAuthStart, OAuthCallback methods
- Triggers: User clicks "Login with Google/Microsoft"
- Responsibilities:
  1. OAuthStart: Redirects to OAuth provider (Google/Microsoft)
  2. OAuthCallback: Handles provider callback, extracts user profile
  3. Calls `AuthService.OAuthCallback()` to upsert user and create JWT
  4. Sets JWT in httpOnly cookie and/or returns in response

**Protected API Routes:**
- Entry: Requests to `/api/*` routes with JWT/cookie
- Middleware: AuthMiddleware validates token, injects user into context
- Responsibility: Ensure only authenticated users can access protected resources

**Health Check:**
- Route: GET `/health`
- Public endpoint for load balancers to verify service is alive
- Returns: `{"status": "ok"}`

## Error Handling

**Strategy:** Structured errors with tagged metadata for client consumption

**Patterns:**

**Service Errors:**
- Services return `*ServiceError` (custom type) or nil
- Error codes: NOT_FOUND, VALIDATION_ERROR, FORBIDDEN, INTERNAL_ERROR, etc.
- Error tags: Array of strings for fine-grained categorization (e.g., ["TRANSACTION.AMOUNT_MUST_BE_GREATER_THAN_ZERO", "INDEX_0"])
- Example: `ErrAmountMustBeGreaterThanZero` predefined in `pkg/errors/errors.go`

**Handler Error Conversion:**
- Handlers receive service errors
- If error implements `TaggedHTTPError` interface, extract code, message, tags
- Return JSON: `{"error": "Bad Request", "message": "amount must be greater than zero", "tags": ["TRANSACTION.AMOUNT_MUST_BE_GREATER_THAN_ZERO"]}`
- Fallback to generic 500 for unexpected errors

**Middleware Error Handler:**
- Location: `internal/middleware/error_handler.go`
- Converts all errors (Echo HTTPError, ServiceError) to standardized ErrorResponse
- Logs server errors (500) in production
- Returns JSON with error code, message, tags

**Validation Errors:**
- Business validation happens in services
- Example: `TransactionService.Create()` checks amount > 0, transaction type valid, account exists
- Returns tagged errors for client guidance on what field is invalid

## Cross-Cutting Concerns

**Logging:**
- Framework: Echo's built-in logger middleware via `echo/middleware.Logger()`
- Pattern: Request/response logging for debugging and monitoring
- No centralized application logging; errors logged only in production mode

**Validation:**
- Layer: Primarily in services before persistence
- Examples:
  - Transaction amount > 0: `ErrAmountMustBeGreaterThanZero`
  - Transaction type must be valid: `ErrInvalidTransactionType`
  - Recurrence end date must be after transaction date: `ErrRecurrenceEndDateMustBeAfterTransactionDate`
- Fine-grained tags enable client to show specific validation messages

**Authentication:**
- Layer: Middleware (AuthMiddleware) and AuthService
- Flow:
  1. AuthMiddleware extracts JWT from header or cookie
  2. AuthMiddleware calls `AuthService.ValidateToken(token)`
  3. Service decodes JWT and returns User if valid
  4. Middleware injects user into context
- Scope: All `/api/*` routes require auth; public routes: `/health`, `/auth/*`

**Authorization:**
- Pattern: Service methods accept `userID` parameter for ownership checks
- Examples:
  - `AccountService.Update(ctx, userID, account)` verifies user owns account
  - `TransactionService.Delete(ctx, userID, id, ...)` verifies user created/owns transaction
  - Failures return FORBIDDEN error

**Soft Deletes:**
- Implementation: `deleted_at` timestamp column on Transaction table (gorm.DeletedAt)
- Behavior: Repositories check `deleted_at IS NULL` in WHERE clauses
- Benefit: Preserve data for auditing, reversible operations

**Recurrence Handling:**
- Pattern: Parent recurrence record with installment count; each transaction linked via `TransactionRecurrenceID` + `InstallmentNumber`
- Propagation: Updates/deletes can target `all` (entire series), `current` (single transaction), or `current_and_future` (transaction onward)
- Implementation: Service layer determines which transactions to modify based on propagation setting

**Shared Expenses (Splits):**
- Pattern: `Settlement` records link original transaction to each participant's share
- Types: `credit` (what user is owed), `debit` (what user owes)
- Related tables: `linked_transactions` (transfer pairs), `settlements` (split tracking)
- Authorization: Only original transaction creator can modify splits

---

*Architecture analysis: 2026-04-09*
