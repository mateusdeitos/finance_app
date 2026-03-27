## Context

The app uses OAuth (Google/Microsoft via Goth) as its only authentication mechanism. JWTs are issued as HttpOnly cookies (`auth_token`). There is no username/password login.

Playwright needs to be authenticated before running tests. Real OAuth requires a browser redirect through a third-party provider — not viable in CI or automated test runs.

The backend `ENV` config field already distinguishes `production` from `development`. The cookie-setting pattern in `AuthHandler.OAuthCallback` is the reference implementation for how to issue a JWT.

## Goals / Non-Goals

**Goals:**
- Playwright test suite in `frontend/e2e/` covering core flows: login, accounts CRUD, categories CRUD, transactions CRUD
- Backend `POST /auth/test-login` endpoint that issues a real JWT without OAuth (only active when `ENV != production`)
- Global Playwright setup that creates a test user via the backend API and stores the auth cookie in a browser storage state file
- Page Object Models (POMs) for reusable UI interactions
- Tests run via `npm run e2e` locally and in CI via Docker Compose

**Non-Goals:**
- Testing every edge case or error state (focus on happy paths first)
- Visual regression / screenshot diff testing
- Load or performance testing
- Mobile-specific viewport testing in this iteration

## Decisions

### 1. Test-login endpoint, not token generation in test code

**Decision**: Backend exposes `POST /auth/test-login` (body: `{ email: string }`) that upserts a user and returns a JWT cookie, guarded by `ENV != production`.

**Alternatives considered**:
- *Generate JWT directly in test code*: would require sharing the JWT secret with the test environment — couples secret management to test infra, and tests would bypass the real token-generation path.
- *Mock the auth middleware*: not possible with a real running server; also would skip the actual cookie-setting behavior.
- *Playwright browser-level cookie injection*: still needs a valid token value, so the same problem recurs.

**Rationale**: The backend endpoint is minimal (10–15 lines), uses the existing `authService.OAuthCallback`-style path, and means tests exercise real auth cookies exactly as a user would.

### 2. Global setup writes browser storage state to file

**Decision**: Playwright global setup (`e2e/global-setup.ts`) calls `POST /auth/test-login`, reads the `auth_token` cookie from the response, then writes a `storageState.json` file. All test specs reference this file via `use: { storageState }` in `playwright.config.ts`.

**Rationale**: Avoids repeating login in every test file. Single authentication per test run. Idempotent — re-running setup always refreshes the cookie.

### 3. Page Object Models per page/feature area

**Decision**: One POM class per major page (`AccountsPage`, `CategoriesPage`, `TransactionsPage`). POMs encapsulate selectors and actions; test specs only call high-level methods.

**Rationale**: Keeps test specs readable. Selector changes require edits in one place.

### 4. Test user isolation via fixed email

**Decision**: The test user email is a fixed constant (`e2e-test@financeapp.local`). Global teardown (or the test-login endpoint) can wipe and recreate this user's data between runs.

**Rationale**: Simple — no need for random UUIDs or per-run cleanup scripts. CI always starts with a clean DB (Docker Compose `--renew-anon-volumes`).

### 5. Playwright runs against the real stack (not mocked API)

**Decision**: Tests run against a real backend + real PostgreSQL. Docker Compose file extended with an `e2e` profile.

**Alternatives considered**:
- *Mock Service Worker (MSW)*: faster, but doesn't exercise backend validation, DB constraints, or real API responses. Defeats the purpose of e2e.

**Rationale**: True confidence requires the full stack. Backend and DB startup adds ~5s but tests remain deterministic.

## Risks / Trade-offs

- **Test-login endpoint leaks if deployed to production** → Mitigated: guarded by `h.cfg.App.Env != "production"` check; returns 404 in production. Add comment in code + deployment checklist.
- **Flaky tests due to timing** → Mitigated: use Playwright's built-in `waitFor` / `expect(locator).toBeVisible()` which auto-retry. Avoid `page.waitForTimeout`.
- **Test DB state bleed between test files** → Mitigated: each test file that modifies data should clean up (delete created records) in `afterEach`/`afterAll`, or reset via the API.
- **CI setup complexity** → Mitigated: single `docker-compose.e2e.yml` that extends the base compose file; one `npm run e2e:ci` script handles container lifecycle.

## Migration Plan

1. Add backend endpoint + route registration (feature-flagged by ENV)
2. Install Playwright, create config and global setup
3. Implement POMs and first test specs
4. Add `npm run e2e` script to `package.json`
5. Add CI job / workflow step

No migrations or data model changes. Rollback: revert commits; the endpoint is additive.

## Open Questions

- Should the global teardown delete the test user's data, or rely on a fresh DB per CI run? (Recommend: rely on fresh DB in CI; teardown optional for local dev)
- Should we add a `TEST_AUTH_SECRET` separate from `JWT_SECRET`, or reuse the same secret? (Recommend: reuse `JWT_SECRET` — simpler, same validation path)
