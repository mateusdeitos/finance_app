package service

import (
	"context"

	"github.com/finance_app/backend/internal/config"
	"github.com/finance_app/backend/internal/repository"
	"github.com/finance_app/backend/mocks"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/suite"
)

// ServiceTestSuite is a testify suite that provides all services with mocked repositories
// Usage:
//
//	type MyServiceTestSuite struct {
//	    ServiceTestSuite
//	}
//
//	func (suite *MyServiceTestSuite) TestSomething() {
//	    suite.Services.Transaction.Create(...)
//	    suite.GetMockTransactionRepository().EXPECT()...
//	}
//
//	func TestMyService(t *testing.T) {
//	    suite.Run(t, new(MyServiceTestSuite))
//	}
type ServiceTestSuite struct {
	suite.Suite

	// UserID is the user ID for the test
	UserID int

	// Services contains all service instances with mocked repositories
	Services *Services

	// Repos contains all mocked repositories
	Repos *repository.Repositories

	// Config contains test configuration
	Config *config.Config

	// Mock repositories for direct access
	MockDBTransaction                   *mocks.MockDBTransaction
	MockUserRepository                  *mocks.MockUserRepository
	MockUserSocialRepository            *mocks.MockUserSocialRepository
	MockAccountRepository               *mocks.MockAccountRepository
	MockCategoryRepository              *mocks.MockCategoryRepository
	MockTagRepository                   *mocks.MockTagRepository
	MockTransactionRepository           *mocks.MockTransactionRepository
	MockTransactionRecurrenceRepository *mocks.MockTransactionRecurrenceRepository
	MockUserSettingsRepository          *mocks.MockUserSettingsRepository
	MockUserConnectionRepository        *mocks.MockUserConnectionRepository
}

// SetupTest is called before each test method
// It initializes all mocked repositories and services
//
// NOTE: If you encounter compilation errors about missing methods in mocks
// (e.g., "missing method Delete" or "missing method Search"),
// regenerate the mocks by running: make generate-mocks
func (suite *ServiceTestSuite) SetupTest() {
	suite.UserID = 1

	// Create all mocked repositories using NewMock* constructors
	// These constructors ensure proper setup and cleanup
	suite.MockDBTransaction = mocks.NewMockDBTransaction(suite.T())
	suite.defaultMockTx()

	suite.MockUserRepository = mocks.NewMockUserRepository(suite.T())
	suite.MockUserSocialRepository = mocks.NewMockUserSocialRepository(suite.T())
	suite.MockAccountRepository = mocks.NewMockAccountRepository(suite.T())
	suite.MockCategoryRepository = mocks.NewMockCategoryRepository(suite.T())
	suite.MockTagRepository = mocks.NewMockTagRepository(suite.T())
	suite.MockTransactionRepository = mocks.NewMockTransactionRepository(suite.T())
	suite.MockTransactionRecurrenceRepository = mocks.NewMockTransactionRecurrenceRepository(suite.T())
	suite.MockUserSettingsRepository = mocks.NewMockUserSettingsRepository(suite.T())
	suite.MockUserConnectionRepository = mocks.NewMockUserConnectionRepository(suite.T())

	// Create repositories struct
	suite.Repos = &repository.Repositories{
		DBTransaction:         suite.MockDBTransaction,
		User:                  suite.MockUserRepository,
		UserSocial:            suite.MockUserSocialRepository,
		Account:               suite.MockAccountRepository,
		Category:              suite.MockCategoryRepository,
		Tag:                   suite.MockTagRepository,
		Transaction:           suite.MockTransactionRepository,
		TransactionRecurrence: suite.MockTransactionRecurrenceRepository,
		UserSettings:          suite.MockUserSettingsRepository,
		UserConnection:        suite.MockUserConnectionRepository,
	}

	// Create test config for AuthService
	suite.Config = &config.Config{
		JWT: config.JWTConfig{
			Secret:          "test-secret-key-for-testing-only",
			ExpirationHours: 24,
		},
	}

	// Create services that don't depend on other services first
	authService := NewAuthService(suite.Repos, suite.Config)
	accountService := NewAccountService(suite.Repos)
	categoryService := NewCategoryService(suite.Repos)
	tagService := NewTagService(suite.Repos)

	// Create Services struct with the services created so far
	suite.Services = &Services{
		Auth:     authService,
		Account:  accountService,
		Category: categoryService,
		Tag:      tagService,
	}

	// Create services that depend on the Services struct
	transactionService := NewTransactionService(suite.Repos, suite.Services)
	userConnectionService := NewUserConnectionService(suite.Repos, suite.Services)

	// Add the remaining services to the Services struct
	suite.Services.Transaction = transactionService
	suite.Services.UserConnection = userConnectionService
}

func (suite *ServiceTestSuite) defaultMockTx() {
	suite.MockDBTransaction.EXPECT().Begin(mock.Anything).RunAndReturn(func(ctx context.Context) (context.Context, error) {
		return ctx, nil
	}).Maybe()
	suite.MockDBTransaction.EXPECT().Commit(mock.Anything).RunAndReturn(func(ctx context.Context) error {
		return nil
	}).Maybe()
	suite.MockDBTransaction.EXPECT().Rollback(mock.Anything).RunAndReturn(func(ctx context.Context) error {
		return nil
	}).Maybe()
}

// TearDownTest is called after each test method
// It can be overridden in test suites that need cleanup
func (suite *ServiceTestSuite) TearDownTest() {
	// Mocks will automatically assert expectations via Cleanup functions
	// Add any additional cleanup here if needed
}
