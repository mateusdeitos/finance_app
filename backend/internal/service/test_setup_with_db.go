package service

import (
	"context"
	"fmt"
	"math/rand/v2"
	"sync"

	"github.com/finance_app/backend/internal/config"
	"github.com/finance_app/backend/internal/domain"
	"github.com/finance_app/backend/internal/repository"
	"github.com/finance_app/backend/pkg/tests"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/suite"
	"gorm.io/gorm"
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
type ServiceTestWithDBSuite struct {
	suite.Suite

	// DB is the database connection
	DB *gorm.DB

	// UserID is the user ID for the test
	UserID int

	// Services contains all service instances with mocked repositories
	Services *Services

	// Repos contains all mocked repositories
	Repos *repository.Repositories

	// Config contains test configuration
	Config *config.Config

	// Mock repositories for direct access
	DBTransaction                   repository.DBTransaction
	UserRepository                  repository.UserRepository
	UserSocialRepository            repository.UserSocialRepository
	AccountRepository               repository.AccountRepository
	CategoryRepository              repository.CategoryRepository
	TagRepository                   repository.TagRepository
	TransactionRepository           repository.TransactionRepository
	TransactionRecurrenceRepository repository.TransactionRecurrenceRepository
	UserSettingsRepository          repository.UserSettingsRepository
	UserConnectionRepository        repository.UserConnectionRepository
	SettlementRepository            repository.SettlementRepository
}

var initDb sync.Once
var sharedDB *gorm.DB

// SetupTest is called before each test method
// It initializes all mocked repositories and services
//
// NOTE: If you encounter compilation errors about missing methods in mocks
// (e.g., "missing method Delete" or "missing method Search"),
// regenerate the mocks by running: make generate-mocks
func (suite *ServiceTestWithDBSuite) SetupTest() {
	suite.UserID = 1

	initDb.Do(func() {
		testDb, err := tests.NewTestDatabase(context.Background())
		if err != nil {
			suite.T().Fatalf("Failed to connect to database: %v", err)
		}
		sharedDB = testDb.Db
	})

	suite.DB = sharedDB

	// Create all mocked repositories using NewMock* constructors
	// These constructors ensure proper setup and cleanup
	suite.DBTransaction = repository.NewDBTransaction(suite.DB)

	suite.UserRepository = repository.NewUserRepository(suite.DB)
	suite.UserSocialRepository = repository.NewUserSocialRepository(suite.DB)
	suite.AccountRepository = repository.NewAccountRepository(suite.DB)
	suite.CategoryRepository = repository.NewCategoryRepository(suite.DB)
	suite.TagRepository = repository.NewTagRepository(suite.DB)
	suite.TransactionRepository = repository.NewTransactionRepository(suite.DB)
	suite.TransactionRecurrenceRepository = repository.NewTransactionRecurrenceRepository(suite.DB)
	suite.UserSettingsRepository = repository.NewUserSettingsRepository(suite.DB)
	suite.UserConnectionRepository = repository.NewUserConnectionRepository(suite.DB)
	suite.SettlementRepository = repository.NewSettlementRepository(suite.DB)

	// Create repositories struct
	suite.Repos = &repository.Repositories{
		DBTransaction:         suite.DBTransaction,
		User:                  suite.UserRepository,
		UserSocial:            suite.UserSocialRepository,
		Account:               suite.AccountRepository,
		Category:              suite.CategoryRepository,
		Tag:                   suite.TagRepository,
		Transaction:           suite.TransactionRepository,
		TransactionRecurrence: suite.TransactionRecurrenceRepository,
		UserSettings:          suite.UserSettingsRepository,
		UserConnection:        suite.UserConnectionRepository,
		Settlement:            suite.SettlementRepository,
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
	settlementService := NewSettlementService(suite.Repos)

	// Create Services struct with the services created so far
	suite.Services = &Services{
		Auth:       authService,
		Account:    accountService,
		Category:   categoryService,
		Tag:        tagService,
		Settlement: settlementService,
	}

	// Create services that depend on the Services struct
	transactionService := NewTransactionService(suite.Repos, suite.Services)
	userConnectionService := NewUserConnectionService(suite.Repos, suite.Services)

	// Add the remaining services to the Services struct
	suite.Services.Transaction = transactionService
	suite.Services.UserConnection = userConnectionService
}

func (suite *ServiceTestWithDBSuite) createTestUser(ctx context.Context) (*domain.User, error) {
	randomInt := rand.IntN(1000000)
	return suite.Repos.User.Create(ctx, &domain.User{
		Name:  fmt.Sprintf("Test User %d", randomInt),
		Email: fmt.Sprintf("test_user_%d@example.com", randomInt),
	})
}

func (suite *ServiceTestWithDBSuite) createTestAccount(ctx context.Context, user *domain.User) (*domain.Account, error) {
	randomInt := rand.IntN(1000000)
	return suite.Repos.Account.Create(ctx, &domain.Account{
		Name:     fmt.Sprintf("Test Account %d (User: %s)", randomInt, user.Name),
		UserID:   user.ID,
		IsActive: true,
	})
}

func (suite *ServiceTestWithDBSuite) createTestCategory(ctx context.Context, user *domain.User) (*domain.Category, error) {
	randomInt := rand.IntN(1000000)
	return suite.Repos.Category.Create(ctx, &domain.Category{
		Name:   fmt.Sprintf("Test Category %d (User: %s)", randomInt, user.Name),
		UserID: user.ID,
	})
}

func (suite *ServiceTestWithDBSuite) createTestTag(ctx context.Context, user *domain.User) (*domain.Tag, error) {
	randomInt := rand.IntN(1000000)
	return suite.Repos.Tag.Create(ctx, &domain.Tag{
		Name:   fmt.Sprintf("test_tag_%d", randomInt),
		UserID: user.ID,
	})
}

func (suite *ServiceTestWithDBSuite) createAcceptedTestUserConnection(ctx context.Context, fromUserID, toUserID, fromDefaultSplitPercentage int) (*domain.UserConnection, error) {
	userConnection, err := suite.Services.UserConnection.Create(ctx, fromUserID, toUserID, fromDefaultSplitPercentage)
	if err != nil {
		return nil, err
	}

	assert.Equal(suite.T(), fromUserID, userConnection.FromUserID)
	assert.Equal(suite.T(), toUserID, userConnection.ToUserID)
	assert.Greater(suite.T(), userConnection.ID, 0)
	assert.Greater(suite.T(), userConnection.FromAccountID, 0)
	assert.Greater(suite.T(), userConnection.ToAccountID, 0)

	assert.Equal(suite.T(), fromDefaultSplitPercentage, userConnection.FromDefaultSplitPercentage)
	assert.Equal(suite.T(), fromDefaultSplitPercentage, userConnection.ToDefaultSplitPercentage)
	assert.Equal(suite.T(), domain.UserConnectionStatusPending, userConnection.ConnectionStatus)

	err = suite.Services.UserConnection.UpdateStatus(ctx, toUserID, userConnection.ID, domain.UserConnectionStatusAccepted)
	if err != nil {
		return nil, err
	}

	userConnections, err := suite.Services.UserConnection.Search(ctx, domain.UserConnectionSearchOptions{
		IDs: []int{userConnection.ID},
	})
	if err != nil {
		return nil, err
	}

	userConnection = userConnections[0]
	assert.Equal(suite.T(), domain.UserConnectionStatusAccepted, userConnection.ConnectionStatus)

	return userConnection, nil
}

func (suite *ServiceTestWithDBSuite) createManyConnections(ctx context.Context, fromUserID int, n int) ([]*domain.UserConnection, error) {
	userConnections := make([]*domain.UserConnection, 0, n)
	for range n {
		user, err := suite.createTestUser(ctx)
		if err != nil {
			return nil, err
		}
		userConnection, err := suite.createAcceptedTestUserConnection(ctx, fromUserID, user.ID, 50)
		if err != nil {
			return nil, err
		}
		userConnections = append(userConnections, userConnection)

	}
	return userConnections, nil
}

// TearDownTest is called after each test method
// It can be overridden in test suites that need cleanup
func (suite *ServiceTestWithDBSuite) TearDownTest() {
	// Mocks will automatically assert expectations via Cleanup functions
	// Add any additional cleanup here if needed
}
