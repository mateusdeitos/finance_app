package domain

const SettingKeyOnboardingCompleted = "onboarding_completed"

type OnboardingStatus struct {
	Completed bool `json:"completed"`
}

type OnboardingAccountInput struct {
	Name                  string  `json:"name"`
	Description           *string `json:"description,omitempty"`
	InitialBalance        int64   `json:"initial_balance"`
	AvatarBackgroundColor *string `json:"avatar_background_color,omitempty"`
}

type OnboardingCategoryInput struct {
	Name     string                    `json:"name"`
	Emoji    *string                   `json:"emoji,omitempty"`
	Children []OnboardingCategoryInput `json:"children,omitempty"`
}

type OnboardingSetupRequest struct {
	Accounts   []OnboardingAccountInput  `json:"accounts"`
	Categories []OnboardingCategoryInput `json:"categories"`
}
