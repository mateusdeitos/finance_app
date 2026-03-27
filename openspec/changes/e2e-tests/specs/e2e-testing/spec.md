## ADDED Requirements

### Requirement: Test-login endpoint issues JWT without OAuth
The backend SHALL expose `POST /auth/test-login` that accepts `{ "email": string }` and returns an `auth_token` HttpOnly cookie containing a valid JWT for the given user (creating the user if they do not exist). This endpoint SHALL only be registered when `ENV` is not `production`.

#### Scenario: Successful test login
- **WHEN** `POST /auth/test-login` is called with `{ "email": "e2e-test@financeapp.local" }` and `ENV=development`
- **THEN** the response sets an `auth_token` HttpOnly cookie with a valid JWT and returns HTTP 200

#### Scenario: Endpoint absent in production
- **WHEN** the server starts with `ENV=production`
- **THEN** `POST /auth/test-login` returns HTTP 404

#### Scenario: Missing email returns error
- **WHEN** `POST /auth/test-login` is called with an empty or missing `email` field
- **THEN** the response returns HTTP 400

### Requirement: Playwright global setup authenticates test user
The e2e test suite SHALL include a global setup script that calls `POST /auth/test-login` and saves the resulting `auth_token` cookie into a Playwright `storageState.json` file so that all test specs start in an authenticated state without repeating login.

#### Scenario: Global setup produces valid storage state
- **WHEN** Playwright global setup runs before any test spec
- **THEN** `storageState.json` exists and contains the `auth_token` cookie for the test user

#### Scenario: Tests skip login page
- **WHEN** a test spec runs with `storageState` configured
- **THEN** navigating to a protected route renders the authenticated page, not the login redirect

### Requirement: Accounts page e2e coverage
The test suite SHALL cover the following scenarios for the Accounts page.

#### Scenario: Create a new account
- **WHEN** the user fills in account name and initial balance and submits the form
- **THEN** the new account appears in the accounts list

#### Scenario: Edit an existing account
- **WHEN** the user opens the edit form for an account, changes its name, and saves
- **THEN** the updated name is displayed in the accounts list

#### Scenario: Deactivate an account
- **WHEN** the user deactivates an active account
- **THEN** the account is marked as inactive in the list

#### Scenario: Delete an account
- **WHEN** the user confirms deletion of an account
- **THEN** the account no longer appears in the accounts list

### Requirement: Categories page e2e coverage
The test suite SHALL cover the following scenarios for the Categories page.

#### Scenario: Create a root category
- **WHEN** the user clicks "Nova Categoria", types a name in the inline input, and presses Enter
- **THEN** the new category appears in the category tree

#### Scenario: Create a subcategory
- **WHEN** the user clicks the add-child button on a parent category, types a name, and presses Enter
- **THEN** the new subcategory appears nested under the parent

#### Scenario: Edit a category name inline
- **WHEN** the user clicks the category name text, types a new name, and presses Enter
- **THEN** the updated name is displayed in the tree

#### Scenario: Delete a category
- **WHEN** the user clicks the delete button on a category and confirms
- **THEN** the category no longer appears in the tree

### Requirement: Transactions page e2e coverage
The test suite SHALL cover the following scenarios for the Transactions page.

#### Scenario: Create an expense transaction
- **WHEN** the user opens the transaction form, fills in amount, description, account, and date, and submits
- **THEN** the new transaction appears in the transaction list for the selected month

#### Scenario: Create an income transaction
- **WHEN** the user selects "Receita", fills in amount, description, account, and date, and submits
- **THEN** the new income transaction appears in the transaction list

#### Scenario: Delete a transaction
- **WHEN** the user deletes an existing transaction
- **THEN** the transaction no longer appears in the list

### Requirement: Page Object Models encapsulate selectors
The test suite SHALL use Page Object Model classes for each major page (`AccountsPage`, `CategoriesPage`, `TransactionsPage`) so that selectors are defined in one place and test specs only call high-level action methods.

#### Scenario: POM methods are used in test specs
- **WHEN** a test spec needs to interact with a page element
- **THEN** it calls a method on the corresponding POM class rather than using raw locators inline
