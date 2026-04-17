package service

import (
	"context"
	"fmt"
	"time"

	"github.com/finance_app/backend/internal/config"
	"github.com/finance_app/backend/internal/domain"
	"github.com/finance_app/backend/internal/repository"
	apperrors "github.com/finance_app/backend/pkg/errors"
	"github.com/golang-jwt/jwt/v5"
)

type authService struct {
	userRepo            repository.UserRepository
	userSocialRepo      repository.UserSocialRepository
	config              *config.Config
	passwordResetTokens map[string]passwordResetToken // In production, use Redis or DB
}

type passwordResetToken struct {
	Email     string
	ExpiresAt time.Time
}

func NewAuthService(repos *repository.Repositories, cfg *config.Config) AuthService {
	return &authService{
		userRepo:            repos.User,
		userSocialRepo:      repos.UserSocial,
		config:              cfg,
		passwordResetTokens: make(map[string]passwordResetToken),
	}
}

func (s *authService) OAuthCallback(ctx context.Context, provider string, user *domain.User, providerID string) (*domain.User, string, error) {
	providerType := domain.ProviderType(provider)
	if providerType != domain.ProviderGoogle && providerType != domain.ProviderMicrosoft {
		return nil, "", apperrors.BadRequest(fmt.Sprintf("unsupported provider: %s", provider))
	}

	// Check if social account exists
	userSocial, err := s.userSocialRepo.GetByProviderID(ctx, providerType, providerID)
	if err != nil {
		return nil, "", apperrors.Internal("failed to check social account", err)
	}

	var dbUser *domain.User

	if userSocial != nil {
		// Existing social account, get user
		dbUser, err = s.userRepo.GetByID(ctx, userSocial.UserID)
		if err != nil {
			return nil, "", apperrors.Internal("failed to get user", err)
		}

		// Overwrite avatar on every login (D-02)
		dbUser.AvatarURL = user.AvatarURL
		if err := s.userRepo.Update(ctx, dbUser); err != nil {
			return nil, "", apperrors.Internal("failed to update user avatar", err)
		}
	} else {
		// New social account, create user
		dbUser = &domain.User{
			Name:      user.Name,
			Email:     user.Email,
			AvatarURL: user.AvatarURL,
			Password:  "", // No password for OAuth users
			CreatedAt: time.Now(),
			UpdatedAt: time.Now(),
		}

		// Check if user with email exists
		existing, err := s.userRepo.GetByEmail(ctx, user.Email)
		if err != nil {
			return nil, "", apperrors.Internal("failed to check existing user", err)
		}

		if existing != nil {
			dbUser = existing
			// Update avatar for existing email user linking new social
			dbUser.AvatarURL = user.AvatarURL
			if err := s.userRepo.Update(ctx, dbUser); err != nil {
				return nil, "", apperrors.Internal("failed to update user avatar", err)
			}
		} else {
			dbUser, err = s.userRepo.Create(ctx, dbUser)
			if err != nil {
				return nil, "", apperrors.Internal("failed to create user", err)
			}
		}

		// Create social account link
		userSocial = &domain.UserSocial{
			UserID:     dbUser.ID,
			Provider:   providerType,
			ProviderID: providerID,
			CreatedAt:  time.Now(),
			UpdatedAt:  time.Now(),
		}

		if err := s.userSocialRepo.Create(ctx, userSocial); err != nil {
			return nil, "", apperrors.Internal("failed to create social account", err)
		}
	}

	// Generate JWT token
	token, err := s.generateToken(dbUser)
	if err != nil {
		return nil, "", apperrors.Internal("failed to generate token", err)
	}

	return dbUser, token, nil
}

func (s *authService) TestLogin(ctx context.Context, email string) (string, error) {
	user, err := s.userRepo.GetByEmail(ctx, email)
	if err != nil {
		return "", apperrors.Internal("failed to look up user", err)
	}

	if user == nil {
		user = &domain.User{
			Name:      "Test User",
			Email:     email,
			CreatedAt: time.Now(),
			UpdatedAt: time.Now(),
		}
		user, err = s.userRepo.Create(ctx, user)
		if err != nil {
			return "", apperrors.Internal("failed to create test user", err)
		}
	}

	token, err := s.generateToken(user)
	if err != nil {
		return "", apperrors.Internal("failed to generate token", err)
	}

	return token, nil
}

func (s *authService) ValidateToken(ctx context.Context, tokenString string) (*domain.User, error) {
	token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, apperrors.Unauthorized(fmt.Sprintf("unexpected signing method: %v", token.Header["alg"]))
		}
		return []byte(s.config.JWT.Secret), nil
	})

	if err != nil {
		return nil, apperrors.Unauthorized("invalid token")
	}

	if !token.Valid {
		return nil, apperrors.Unauthorized("invalid token")
	}

	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return nil, apperrors.Unauthorized("invalid token claims")
	}

	userID, ok := claims["user_id"].(float64)
	if !ok {
		return nil, apperrors.Unauthorized("invalid user ID in token")
	}

	user, err := s.userRepo.GetByID(ctx, int(userID))
	if err != nil {
		return nil, apperrors.Internal("failed to get user", err)
	}
	if user == nil {
		return nil, apperrors.NotFound("user")
	}

	return user, nil
}

func (s *authService) generateToken(user *domain.User) (string, error) {
	claims := jwt.MapClaims{
		"user_id": user.ID,
		"email":   user.Email,
		"exp":     time.Now().Add(s.config.JWT.Expiration()).Unix(),
		"iat":     time.Now().Unix(),
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(s.config.JWT.Secret))
}
