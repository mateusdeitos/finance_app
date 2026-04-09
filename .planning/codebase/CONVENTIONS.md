# Coding Conventions

**Analysis Date:** 2026-04-09

## Naming Patterns

**Files:**
- Lowercase with underscores: `transaction_repository.go`, `category_service.go`
- Test files suffix with `_test.go`: `transaction_create_test.go`, `user_repository_test.go`
- Implementation types are unexported (lowercase): `transactionRepository`, `categoryService`

**Functions:**
- Exported functions and methods start with uppercase: `Create()`, `Search()`, `Update()`, `Delete()`
- Constructor functions: `NewCategoryService()`, `NewTransactionRepository()`
- Helper functions start with lowercase: `checkSiblingUniqueness()`, `now()`
- Interface methods use full names without prefixes: `Create`, `Update`, `Delete`, `Search`

**Variables:**
- Package-level receivers use short names: `r` for repository, `s` for service, `h` for handler, `c` for Echo context
- Context always named `ctx`
- Error variables: `err`
- Temporary variables in loops: `i`, `n`
- Function parameter objects: descriptive names like `transaction`, `category`, `options`
- Pointer receivers for struct types with mutable state

**Types:**
- Domain types exported with descriptive names: `Transaction`, `Category`, `Account`, `UserConnection`
- Service interfaces: `TransactionService`, `CategoryService` (exported interfaces in `service/interfaces.go`)
- Repository interfaces: `TransactionRepository`, `CategoryRepository` (exported interfaces in `repository/interfaces.go`)
- Enum types use `Type` suffix: `TransactionType`, `RecurrenceType`, `OperationType`
- Enum constants use `TypeValue` pattern: `TransactionTypeExpense`, `RecurrenceTypeMonthly`
- Search/filter option structs: `CategorySearchOptions`, `TransactionFilter`, `BalanceFilter`
- Request/response structs: `TransactionCreateRequest`, `TransactionUpdateRequest`

## Code Style

**Formatting:**
- Standard Go formatting with `gofmt`
- Note: `.golangci.yml` has gofmt/goimports disabled (4 files non-compliant, re-enable when formatted)
- Line length: lll linter disabled (no hard limit)
- Whitespace: wsl linters disabled to prioritize readability

**Linting:**
- Tool: golangci-lint v2 with .golangci.yml configuration
- Max cyclomatic complexity raised from defaults: cyclop 49, gocyclo 50, gocognit 110, nestif 17
- Most style linters disabled (revive, varnamelen, godot, testifylint, tagliatelle) to focus on correctness
- Test files: excluded from varnamelen, wsl, unconvert, exhaustive, noinlineerr, errcheck, staticcheck, forcetypeassert, misspell
- Auto-generated mocks: all linters disabled
- Linter exclusions documented by path in `.golangci.yml` with justification comments

## Import Organization

**Order:**
1. Standard library: `context`, `fmt`, `net/http`, `time`, etc.
2. External packages: `github.com/labstack/echo/v4`, `github.com/samber/lo`, `gorm.io/gorm`
3. Internal packages: `github.com/finance_app/backend/internal/domain`, `github.com/finance_app/backend/internal/service`
4. Aliased imports: prefix with module name when needed: `pkgErrors "github.com/finance_app/backend/pkg/errors"`

**Path Aliases:**
- `pkgErrors` alias used for `github.com/finance_app/backend/pkg/errors` to distinguish from standard library errors
- No other widespread path aliases; mostly direct imports

## Error Handling

**Patterns:**
- Custom error system in `pkg/errors/` with `ServiceError` type supporting error codes and tags
- Error codes: `ErrorCode` enum with values like `ErrCodeNotFound`, `ErrCodeValidation`, `ErrCodeInternal`
- Fine-grained error classification with `ErrorTag` for specific error conditions (e.g., `ErrorTagMissingDestinationAccount`)
- Repository and service layers return errors wrapped with context
- HTTP layer converts errors using `pkgErrors.ToHTTPError()` which handles `ServiceError` specially
- Error responses include `error` (status text), `message` (human-readable), and `tags` (client-facing error codes)
- Inline error handling pattern: `if err := operation(); err != nil { return handleError(err) }`
- Defer-and-rollback pattern for database transactions:
  ```go
  ctx, err := s.dbTransaction.Begin(ctx)
  if err != nil { return err }
  defer s.dbTransaction.Rollback(ctx)  // Ignored error is intentional for cleanup
  ```

## Logging

**Framework:** `go.uber.org/zap` not used; default to Echo's built-in logger via `c.Logger().Error(err)`

**Patterns:**
- Handler middleware logs errors only in non-debug mode: `if !c.Echo().Debug { c.Logger().Error(err) }`
- Service and repository layers don't log; they return errors for handlers to log
- Test setup uses standard Go testing package with helper functions

## Comments

**When to Comment:**
- Complex business logic: e.g., "os 2 loops são intencionais, para garantir que caso a ordenação da query mude, o resultado ainda será correto" in `CategoryService.Search()`
- Validation steps and security checks: "Verify ownership", "Prevent circular reference"
- Non-obvious design decisions or constraints
- Portuguese comments acceptable where original team uses Portuguese

**JSDoc/TSDoc:**
- Swagger/OpenAPI annotations in handlers starting with `// [Method] godoc` followed by `@Summary`, `@Tags`, `@Accept`, `@Security`, `@Param`, `@Success`, `@Failure`, `@Router`
- Example from `transaction_handler.go`:
  ```go
  // Create godoc
  // @Summary      Create transaction
  // @Description  Creates an expense, income, or transfer...
  // @Tags         transactions
  // @Accept       json
  // @Security     CookieAuth
  // @Security     BearerAuth
  // @Param        transaction  body  domain.TransactionCreateRequest  true  "Transaction data"
  // @Success      201
  // @Failure      400  {object}  middleware.ErrorResponse
  // @Router       /api/transactions [post]
  ```
- No godoc comments on unexported types; interfaces have brief descriptions

## Function Design

**Size:**
- Max lines: 202 (golangci-lint funlen; default 60 raised)
- Max statements: 100 (golangci-lint; default 40 raised)
- Complex functions document their structure with comments
- Example: `TransactionService` has ~200+ line functions for `Create()` and `Update()` with clear section comments

**Parameters:**
- Most parameters explicitly named, avoid single-letter params except in tight loops
- Search/filter operations use option structs rather than many parameters: `Search(ctx context.Context, options domain.CategorySearchOptions)`
- Context always first parameter: `func (s *categoryService) Create(ctx context.Context, ...)`
- UserID parameters explicit: `Create(ctx, userID int, ...)`

**Return Values:**
- Errors always last return value: `(*domain.Category, error)`, `(int, error)`
- Single return for domain objects when only one value: `(*domain.Transaction, error)`
- Nil error and non-nil result indicates success
- Not found returns error (not nil, nil): repository pattern uses `pkgErrors.NotFound("resource")`

## Module Design

**Exports:**
- Repository and service interfaces exported from `repository/interfaces.go` and `service/interfaces.go`
- Concrete implementations unexported: `transactionRepository`, `authService`
- Constructor functions exported: `NewTransactionRepository()`, `NewAuthService()`
- Container structs exported: `Repositories`, `Services` (hold all impls)
- Domain types exported: `Transaction`, `Category`, `User`

**Barrel Files:**
- Not used; each package exports what it needs directly
- Interfaces kept in separate `interfaces.go` file for each package
- Concrete implementations in individual files: `transaction_service.go`, `category_service.go`

## Dependency Injection

**Pattern:**
- Constructor-based DI: `NewCategoryService(repos *repository.Repositories) CategoryService`
- Services injected via `Repositories` and `Services` structs
- Container structs initialized in `cmd/server/main.go` and test setup
- Cross-service dependencies: `TransactionService` and `UserConnectionService` depend on the `Services` struct itself
- Example from main.go: Services created in layers where services that depend on other services are initialized after basic services

## Transaction Management

**Pattern:**
- `DBTransaction` interface for begin/commit/rollback
- Service layer orchestrates transactions: `Begin() -> perform operations -> Commit() or Rollback()`
- Context carries transaction state: `GetTxFromContext()` in repository layer extracts active transaction
- Implicit rollback on defer: `defer s.dbTransaction.Rollback(ctx)` (error ignored intentionally)
- Example from `CategoryService.Create()`:
  ```go
  ctx, err := s.dbTransaction.Begin(ctx)
  if err != nil { return nil, err }
  defer s.dbTransaction.Rollback(ctx)
  
  // Perform operations...
  
  if err := s.dbTransaction.Commit(ctx); err != nil {
    return nil, err
  }
  ```

## Type Conversions

**Domain ↔ Entity Pattern:**
- Domain types: high-level business models in `internal/domain/`
- Entity types: ORM structs (GORM) in `internal/entity/` with SQL tags and relationships
- Conversion methods: `entity.ToDomain()` and `entity.EntityFromDomain(domain)` for translation
- Repositories work with domain types; repository implementation converts to/from entities
- Example: `TransactionFromDomain()` and `ent.ToDomain()` in transaction repository

## Service Layer Patterns

**Validation:**
- Input validation in service layer before DB operations
- Business logic validation (e.g., amount > 0, dates valid, user ownership)
- Example from `TransactionService`: validates transaction type, amount, dates, recurrence settings, split settings before creation
- Detailed error tags for each validation failure help clients show specific error messages

**Access Control:**
- Services verify user ownership: `GetByID(ctx, userID, id int)` enforces userID checks
- Example: `CategoryService.GetByID()` verifies the category belongs to the requesting user
- Handlers extract userID from context and pass to service layer

**Search Operations:**
- Options structs with optional fields: `TransactionFilter`, `CategorySearchOptions`
- Filters use pointer fields for optional criteria: `UserID *int`, `IDs []int`
- Limit and offset via `Limit *int`, `Offset *int` fields in filter
- Example: `repository.Search(ctx, domain.TransactionFilter{UserID: &userID})`

---

*Convention analysis: 2026-04-09*
