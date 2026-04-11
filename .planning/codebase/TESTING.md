# Testing Patterns

**Analysis Date:** 2026-04-09

## Test Framework

**Runner:**
- Go's standard `testing` package (go test)
- Testify `suite` package for suite-based integration tests
- Config: No separate config file; test build tag used for integration tests

**Assertion Library:**
- `github.com/stretchr/testify/assert` and `github.com/stretchr/testify/suite`

**Run Commands:**
```bash
just test                    # All tests (unit + integration)
just test-unit               # Short tests only (go test -short)
just test-integration        # Integration tests (go test -tags=integration)

# Run single test suite
go test ./internal/service/... -run TestTransactionCreateWithDB

# Run single test method
go test ./internal/service/ -run "TestTransactionCreateWithDBTestSuite/TestCreateExpense"
```

## Test File Organization

**Location:**
- Co-located with source code in same package
- Database-backed tests (integration): `internal/service/*_test.go` files
- Simple unit tests: `internal/repository/user_repository_test.go`, `internal/domain/transaction_test.go`

**Naming:**
- Test files: `*_test.go` suffix
- Suite types: `{Feature}WithDBTestSuite` or `{Feature}TestSuite`
- Test methods: `Test{Feature}` (example: `TestCreateExpense`, `TestUpdateTransaction`)
- Sub-test runs: `t.Run("description", func(t *testing.T) { ... })`

**Structure:**
```
internal/service/
├── transaction_create_test.go      # Integration tests for Create()
├── transaction_update_test.go       # Integration tests for Update()
├── transaction_delete_test.go       # Integration tests for Delete()
├── transaction_import_test.go       # Unit + integration tests for CSV import
├── transaction_balance_test.go      # Integration tests for balance calculation
├── test_setup_with_db.go            # Test infrastructure (NOT *_test.go; imports testify)
└── test_setup.go                    # (Mocked repositories version if used)
```

## Test Structure

**Suite Organization:**
```go
type TransactionCreateWithDBTestSuite struct {
	ServiceTestWithDBSuite  // Embedded struct from test_setup_with_db.go
}

func TestTransactionCreateWithDB(t *testing.T) {
	suite.Run(t, new(TransactionCreateWithDBTestSuite))
}
```

**Patterns:**

1. **Setup (SetupTest)**
   - Called before each test method automatically by testify/suite
   - Initializes shared database (via sync.Once for performance)
   - Creates test users, accounts, categories, tags
   - Example from `ServiceTestWithDBSuite.SetupTest()`:
     ```go
     initDb.Do(func() {
       testDb, err := tests.NewTestDatabase(context.Background())
       if err != nil { suite.T().Fatalf("Failed: %v", err) }
       sharedDB = testDb.Db
     })
     
     suite.DB = sharedDB
     suite.UserRepository = repository.NewUserRepository(suite.DB)
     // ... all repositories
     
     suite.Services = &service.Services{
       Auth: NewAuthService(...),
       // ... all services
     }
     ```

2. **Test Method**
   - Arranged in 3 phases: setup local data → act → assert
   - Uses `suite.Assert()` for assertions (fluent style)
   - Uses `suite.T().Fatalf()` for fatal setup errors
   - Example from `TestCreateExpense`:
     ```go
     func (suite *TransactionCreateWithDBTestSuite) TestCreateExpense() {
       ctx := context.Background()
       user, err := suite.createTestUser(ctx)
       if err != nil { suite.T().Fatalf(...) }
       
       account, err := suite.createTestAccount(ctx, user)
       category, err := suite.createTestCategory(ctx, user)
       tag, err := suite.createTestTag(ctx, user)
       
       // Act: create transaction
       _, err = suite.Services.Transaction.Create(ctx, user.ID, &transaction)
       
       // Assert: verify results
       suite.Assert().NoError(err)
       suite.Assert().Len(transactions, 1)
       suite.Assert().Equal(expectedValue, actualValue)
     }
     ```

3. **Teardown (TearDownTest)**
   - Optional; called after each test
   - Auto-cleanup via testify; mocks auto-assert expectations
   - Can be overridden in test suite for custom cleanup

## Mocking

**Framework:** `mockery` (github.com/vektra/mockery)

**Configuration:** `.mockery.yaml`
```yaml
with-expecter: true
dir: "mocks"
packages:
  github.com/finance_app/backend/internal/repository:
    config:
      all: true
  github.com/finance_app/backend/internal/service:
    config:
      all: true
outpkg: "mocks"
```

**Patterns:**
- Auto-generated mocks in `mocks/` directory (never edit manually)
- All repository and service interfaces auto-mocked
- Usage: `suite.GetMock{Interface}().EXPECT().Method(...).Return(...)`
- Example (if used in isolated unit test):
  ```go
  mockRepo := new(mocks.MockTransactionRepository)
  mockRepo.EXPECT().Create(mock.Anything, mock.MatchedBy(func(t *domain.Transaction) bool {
    return t.Amount == 100
  })).Return(&domain.Transaction{ID: 1}, nil)
  ```

**What to Mock:**
- Repository layer in unit tests of service layer (for pure logic testing)
- Never mock in integration tests (use real database)

**What NOT to Mock:**
- Database layer in integration tests (use testcontainers)
- HTTP client or external APIs (mock at boundaries if needed)
- Domain models (use real objects with test data)

## Fixtures and Factories

**Test Data:**
- Created using helper methods on `ServiceTestWithDBSuite`:
  ```go
  func (suite *ServiceTestWithDBSuite) createTestUser(ctx context.Context) (*domain.User, error) {
    n := rand.Int64()
    return suite.Repos.User.Create(ctx, &domain.User{
      Name:  fmt.Sprintf("Test User %d", n),
      Email: fmt.Sprintf("test_user_%d@example.com", n),
    })
  }
  
  func (suite *ServiceTestWithDBSuite) createTestAccount(ctx context.Context, user *domain.User) (*domain.Account, error) {
    return suite.Repos.Account.Create(ctx, &domain.Account{
      Name:     fmt.Sprintf("Test Account %d", rand.Int64()),
      UserID:   user.ID,
      IsActive: true,
    })
  }
  ```
- Randomized names to avoid conflicts: `fmt.Sprintf("test_tag_%d", rand.Int64())`
- Helpers use `rand.Int64()` from `math/rand/v2` for unique test data

**Location:**
- Test helper methods: `internal/service/test_setup_with_db.go` (lines 150-231)
- Helper methods: `createTestUser()`, `createTestAccount()`, `createTestCategory()`, `createTestTag()`, `createAcceptedTestUserConnection()`, `createManyConnections()`

## Coverage

**Requirements:** Not enforced (no coverage threshold)

**View Coverage:**
```bash
go test ./... -cover                  # Coverage summary
go tool cover -html=coverage.out      # HTML report (if coverage.out exists)
```

**Current State:**
- `coverage.out` file present in repository with recent test runs
- Can generate coverage reports but no CI/CD gating

## Test Types

**Unit Tests:**
- Scope: Single function/method in isolation
- Uses: Simple data transformation tests without DB
- Example: `TestPeriodUnmarshalJSON`, `TestComparableSearchToSQL`, `TestParseBRAmount` in `internal/domain/transaction_test.go` and `internal/service/transaction_import_test.go`
- Pattern: Standard Go test function with `testing.T`

**Integration Tests:**
- Scope: Service/repository methods with real PostgreSQL
- Uses: `ServiceTestWithDBSuite` embedded struct providing full DI
- Tagged: No build tag required; use `if testing.Short() { t.Skip(...) }` pattern
- Database: Real PostgreSQL via testcontainers in `pkg/tests/`
- Example: `TestTransactionCreateWithDB`, `TestTransactionUpdateWithDB`, `TestUserRepository_Create`
- Database Initialization: `sync.Once` for shared testcontainers instance across all test methods

**E2E Tests:**
- Not present in backend (backend-only repo, no frontend integration)
- Could be added in separate test suite if needed

## Common Patterns

**Async Testing:**
- All tests use `context.Background()` explicitly
- No goroutines in tests (synchronous test flow)
- Database transactions managed by `DBTransaction` interface (synchronous)

**Error Testing:**
```go
func (suite *TransactionCreateWithDBTestSuite) TestBlockUpdatesOnOtherUsersTransactions() {
  ctx := context.Background()
  
  // Create users and transaction
  user1, _ := suite.createTestUser(ctx)
  user2, _ := suite.createTestUser(ctx)
  account, _ := suite.createTestAccount(ctx, user1)
  category, _ := suite.createTestCategory(ctx, user1)
  
  transaction := domain.TransactionCreateRequest{...}
  transactionID, _ := suite.Services.Transaction.Create(ctx, user1.ID, &transaction)
  
  // Act: try to update with different user
  err := suite.Services.Transaction.Update(ctx, transactionID, user2.ID, &domain.TransactionUpdateRequest{
    Amount: lo.ToPtr(int64(200)),
  })
  
  // Assert: should fail
  suite.Assert().Error(err)
  suite.Assert().ErrorContains(err, "not found")  // or specific error code
}
```

**Table-Driven Tests:**
- Not used in integration tests (suites more appropriate)
- Used in unit tests for multiple cases:
  ```go
  func TestPeriodUnmarshalJSON(t *testing.T) {
    type testStruct struct { Period Period }
    
    t.Run("valid period", func(t *testing.T) { ... })
    t.Run("invalid period", func(t *testing.T) { ... })
    t.Run("should return correct dates", func(t *testing.T) { ... })
  }
  ```

**Database Transaction Management:**
- Test infrastructure wraps service calls in database transactions
- Services manage their own transactions (begin/commit/rollback)
- Test assertions read directly from database via repositories

## Test Execution Flow

**Integration Test Startup:**
1. First test calls `SetupTest()` 
2. `initDb.Do()` initializes single testcontainers PostgreSQL instance
3. All migrations auto-applied via testcontainers
4. Shared DB instance reused across all subsequent tests
5. Each test creates isolated test data (users, accounts, etc.)

**Test Cleanup:**
- Testify suite automatically cleans up after test completes
- Mock expectations auto-verified (testify's Cleanup mechanism)
- Database remains running but test data isolated per test

## Known Testing Gaps

**Coverage Concerns:**
- `UserService` not tested (only used in OAuth flow)
- `AuthService` partially tested via `TestLogin` only
- Handler layer not tested (only business logic in service layer)
- Some error paths in complex functions like `transaction_update.go` uncovered

**Complex Functions Requiring Better Tests:**
- `TransactionService.Create()`: 200+ lines with many validation paths
- `TransactionService.Update()`: Complex propagation logic and state rebuild
- `TransactionService.Delete()`: Recurring installment handling
- These need additional test cases for all propagation settings and edge cases

---

*Testing analysis: 2026-04-09*
