package repository

import (
	"context"
	"testing"

	"github.com/finance_app/backend/internal/domain"
	"github.com/finance_app/backend/internal/entity"
	"github.com/stretchr/testify/assert"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"
	gormPostgres "gorm.io/driver/postgres"
	"gorm.io/gorm"
)

func setupTestDB(t *testing.T) *gorm.DB {
	ctx := context.Background()

	postgresContainer, err := postgres.RunContainer(ctx,
		testcontainers.WithImage("postgres:15-alpine"),
		postgres.WithDatabase("test_db"),
		postgres.WithUsername("test_user"),
		postgres.WithPassword("test_password"),
		testcontainers.WithWaitStrategy(
			wait.ForLog("database system is ready to accept connections").
				WithOccurrence(1).
				WithStartupTimeout(30),
		),
	)
	if err != nil {
		t.Fatalf("Failed to start postgres container: %v", err)
	}

	t.Cleanup(func() {
		if err := postgresContainer.Terminate(ctx); err != nil {
			t.Fatalf("Failed to terminate postgres container: %v", err)
		}
	})

	connStr, err := postgresContainer.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		t.Fatalf("Failed to get connection string: %v", err)
	}

	db, err := gorm.Open(gormPostgres.Open(connStr), &gorm.Config{})
	if err != nil {
		t.Fatalf("Failed to connect to database: %v", err)
	}

	// Run migrations
	if err := db.AutoMigrate(&entity.User{}); err != nil {
		t.Fatalf("Failed to run migrations: %v", err)
	}

	return db
}

func TestUserRepository_Create(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping integration test")
	}

	db := setupTestDB(t)
	repo := NewUserRepository(db)

	t.Run("create user successfully", func(t *testing.T) {
		user := &domain.User{
			Name:     "Test User",
			Email:    "test@example.com",
			Password: "hashed_password",
		}

		created, err := repo.Create(context.Background(), user)

		assert.NoError(t, err)
		assert.NotNil(t, created)
		assert.NotZero(t, created.ID)
		assert.Equal(t, "Test User", created.Name)
		assert.Equal(t, "test@example.com", created.Email)
	})
}

func TestUserRepository_GetByEmail(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping integration test")
	}

	db := setupTestDB(t)
	repo := NewUserRepository(db)

	t.Run("get user by email", func(t *testing.T) {
		// Create user first
		user := &domain.User{
			Name:     "Test User",
			Email:    "test@example.com",
			Password: "hashed_password",
		}
		created, err := repo.Create(context.Background(), user)
		assert.NoError(t, err)

		// Get by email
		found, err := repo.GetByEmail(context.Background(), "test@example.com")

		assert.NoError(t, err)
		assert.NotNil(t, found)
		assert.Equal(t, created.ID, found.ID)
		assert.Equal(t, "test@example.com", found.Email)
	})

	t.Run("user not found", func(t *testing.T) {
		found, err := repo.GetByEmail(context.Background(), "nonexistent@example.com")

		assert.NoError(t, err)
		assert.Nil(t, found)
	})
}
