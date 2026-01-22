package repository

import (
	"context"
	"testing"

	"github.com/finance_app/backend/internal/domain"
	"github.com/finance_app/backend/pkg/tests"
	"github.com/stretchr/testify/assert"
)

func TestUserRepository_Create(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping integration test")
	}

	db, err := tests.NewTestDatabase(context.Background())
	if err != nil {
		t.Fatalf("Failed to create test database: %v", err)
	}
	repo := NewUserRepository(db.Db)

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

	db, err := tests.NewTestDatabase(context.Background())
	if err != nil {
		t.Fatalf("Failed to create test database: %v", err)
	}
	repo := NewUserRepository(db.Db)

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
