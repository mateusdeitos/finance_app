## Why

The app has no automated end-to-end tests, making it risky to ship UI changes without manually verifying core flows. Playwright e2e tests will give confidence that critical paths (auth, transactions, accounts, categories) work correctly from the browser's perspective.

## What Changes

- Add Playwright test suite to the frontend project (`frontend/e2e/`)
- Add a backend test-auth endpoint (dev/test environments only) that issues a JWT for a given email without requiring OAuth — enables Playwright to log in programmatically
- Add helper utilities: global setup (seed test user + obtain JWT cookie), page object models for common UI patterns
- Add npm scripts and CI configuration for running e2e tests

## Capabilities

### New Capabilities
- `e2e-testing`: Playwright test infrastructure, test-auth bypass endpoint, global setup/teardown, and test scenarios for core user flows

### Modified Capabilities
<!-- none -->

## Impact

- **Backend**: New `POST /auth/test-login` endpoint (only registered when `APP_ENV=test` or `APP_ENV=development`); no changes to production auth flow
- **Frontend**: New `frontend/e2e/` directory with Playwright config, fixtures, page object models, and test specs; new dev dependency `@playwright/test`
- **CI**: New GitHub Actions job (or step) that spins up the stack and runs `npx playwright test`
- **No breaking changes** to existing APIs or UI behavior
