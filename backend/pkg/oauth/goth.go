package oauth

import (
	"context"
	"fmt"

	"github.com/finance_app/backend/internal/config"
	"github.com/markbates/goth"
	"github.com/markbates/goth/providers/google"
	"github.com/markbates/goth/providers/microsoftonline"
)

func SetupProviders(cfg *config.Config) {
	// Google OAuth
	if cfg.OAuth.Google.ClientID != "" && cfg.OAuth.Google.ClientSecret != "" {
		goth.UseProviders(
			google.New(
				cfg.OAuth.Google.ClientID,
				cfg.OAuth.Google.ClientSecret,
				cfg.OAuth.Google.CallbackURL,
				"email", "profile",
			),
		)
	}

	// Microsoft OAuth
	if cfg.OAuth.Microsoft.ClientID != "" && cfg.OAuth.Microsoft.ClientSecret != "" {
		goth.UseProviders(
			microsoftonline.New(
				cfg.OAuth.Microsoft.ClientID,
				cfg.OAuth.Microsoft.ClientSecret,
				cfg.OAuth.Microsoft.CallbackURL,
				"User.Read",
			),
		)
	}
}

func GetProvider(ctx context.Context, providerName string) (goth.Provider, error) {
	provider, err := goth.GetProvider(providerName)
	if err != nil {
		return nil, fmt.Errorf("provider %s not found: %w", providerName, err)
	}
	return provider, nil
}
