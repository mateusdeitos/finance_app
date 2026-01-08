package appcontext

import (
	"context"

	"github.com/finance_app/backend/internal/domain"
)

type key string

const (
	UserKey   key = "user"
	UserIDKey key = "user_id"
)

func WithUser(ctx context.Context, user *domain.User) context.Context {
	return context.WithValue(ctx, UserKey, user)
}

func WithUserID(ctx context.Context, userID int) context.Context {
	return context.WithValue(ctx, UserIDKey, userID)
}

func GetUserFromContext(ctx context.Context) *domain.User {
	user, ok := ctx.Value(UserKey).(*domain.User)
	if !ok {
		return nil
	}
	return user
}

func GetUserIDFromContext(ctx context.Context) int {
	userID, ok := ctx.Value(UserIDKey).(int)
	if !ok {
		return 0
	}
	return userID
}
