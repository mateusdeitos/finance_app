export const OnboardingTestIds = {
  Page: 'page_onboarding',
  Stepper: 'stepper_onboarding',
  StepAccounts: 'step_onboarding_accounts',
  StepCategories: 'step_onboarding_categories',
  StepImport: 'step_onboarding_import',
  BtnNext: 'btn_onboarding_next',
  BtnBack: 'btn_onboarding_back',
  BtnFinish: 'btn_onboarding_finish',
  BtnGoToImport: 'btn_onboarding_go_to_import',
  BtnSkipImport: 'btn_onboarding_skip_import',
  AlertError: 'alert_onboarding_error',

  // Accounts
  AccountRow: (id: string) => `row_onboarding_account_${id}` as const,
  CheckboxAccount: (id: string) => `checkbox_onboarding_account_${id}` as const,
  InputAccountBalance: (id: string) => `input_onboarding_account_balance_${id}` as const,
  InputAccountDescription: (id: string) => `input_onboarding_account_description_${id}` as const,
  BtnRemoveAccount: (id: string) => `btn_onboarding_remove_account_${id}` as const,
  BtnAddAccount: 'btn_onboarding_add_account',
  InputNewAccountName: 'input_onboarding_new_account_name',

  // Categories
  CategoryRow: (id: string) => `row_onboarding_category_${id}` as const,
  CheckboxCategory: (id: string) => `checkbox_onboarding_category_${id}` as const,
  InputCategoryName: (id: string) => `input_onboarding_category_name_${id}` as const,
  BtnRemoveCategory: (id: string) => `btn_onboarding_remove_category_${id}` as const,
  BtnAddParentCategory: 'btn_onboarding_add_parent_category',
  BtnAddChildCategory: (parentId: string) => `btn_onboarding_add_child_category_${parentId}` as const,
  InputNewCategoryName: 'input_onboarding_new_category_name',
} as const
