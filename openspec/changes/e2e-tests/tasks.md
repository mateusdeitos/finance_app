## 1. Backend — Test-login endpoint

- [x] 1.1 Add `TestLogin` handler method to `AuthHandler` that accepts `{ email }`, upserts user via `authService.OAuthCallback`, sets `auth_token` cookie, returns 200
- [x] 1.2 Register `POST /auth/test-login` route in the router, guarded so it is only added when `cfg.App.Env != "production"`
- [x] 1.3 Add Swagger annotation to `TestLogin` handler
- [x] 1.4 Verify endpoint returns 404 when `ENV=production` and 200 with cookie when `ENV=development`

## 2. Frontend — Playwright setup

- [x] 2.1 Install `@playwright/test` as a dev dependency and run `npx playwright install --with-deps chromium`
- [x] 2.2 Create `frontend/playwright.config.ts` with base URL, storage state path, and single `chromium` project
- [x] 2.3 Create `frontend/e2e/global-setup.ts` that calls `POST /auth/test-login`, reads `auth_token` cookie from response, and writes `e2e/.auth/storageState.json`
- [x] 2.4 Create `frontend/e2e/global-teardown.ts` (optional: delete test user data via API)
- [x] 2.5 Add `e2e/.auth/` to `.gitignore`
- [x] 2.6 Add `npm run e2e` and `npm run e2e:ui` scripts to `frontend/package.json`

## 3. Page Object Models

- [x] 3.1 Create `frontend/e2e/pages/AccountsPage.ts` with methods: `goto()`, `openCreateForm()`, `fillForm(name, balance)`, `submitForm()`, `editAccount(name)`, `deactivateAccount(name)`, `deleteAccount(name)`, `getAccountNames()`
- [x] 3.2 Create `frontend/e2e/pages/CategoriesPage.ts` with methods: `goto()`, `createRootCategory(name)`, `createSubcategory(parentName, name)`, `editCategoryName(oldName, newName)`, `deleteCategory(name)`, `getCategoryNames()`
- [x] 3.3 Create `frontend/e2e/pages/TransactionsPage.ts` with methods: `goto()`, `openCreateForm()`, `fillExpense(amount, description, accountName)`, `fillIncome(amount, description, accountName)`, `submitForm()`, `deleteTransaction(description)`, `getTransactionDescriptions()`

## 4. Test specs — Accounts

- [x] 4.1 Create `frontend/e2e/tests/accounts.spec.ts` with `beforeAll` to create a test account (via API) and `afterAll` to clean up
- [x] 4.2 Write test: create a new account via UI → verify it appears in the list
- [x] 4.3 Write test: edit an account name → verify updated name in list
- [x] 4.4 Write test: deactivate an account → verify inactive state shown
- [x] 4.5 Write test: delete an account → verify it is removed from list

## 5. Test specs — Categories

- [x] 5.1 Create `frontend/e2e/tests/categories.spec.ts` with `afterEach` cleanup
- [x] 5.2 Write test: create root category via inline input → verify in tree
- [x] 5.3 Write test: create subcategory via add-child button → verify nested under parent
- [x] 5.4 Write test: edit category name inline → verify updated name
- [x] 5.5 Write test: delete category → verify removed from tree

## 6. Test specs — Transactions

- [x] 6.1 Create `frontend/e2e/tests/transactions.spec.ts` with `beforeAll` to create a test account (API) and `afterAll` cleanup
- [x] 6.2 Write test: create expense transaction → verify appears in list
- [x] 6.3 Write test: create income transaction → verify appears in list
- [x] 6.4 Write test: delete a transaction → verify removed from list

## 7. CI integration

- [x] 7.1 Create `docker-compose.e2e.yml` that extends base compose with `e2e` profile, sets `ENV=development`, and exposes backend + frontend ports
- [x] 7.2 Add `npm run e2e:ci` script that handles Docker Compose up, wait-for-ready, run tests, and Docker Compose down
- [x] 7.3 Add GitHub Actions job (or step in existing workflow) that runs `npm run e2e:ci` on pull requests
