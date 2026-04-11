# External Integrations

**Analysis Date:** 2026-04-09

## APIs & External Services

**OAuth Providers:**
- Google OAuth 2.0 - Social login for Google accounts
  - SDK/Client: `github.com/markbates/goth/providers/google`
  - Auth: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
  - Scopes: `email`, `profile`
  - Callback URL: Configured via `GOOGLE_CALLBACK_URL` env var

- Microsoft OAuth 2.0 - Social login for Microsoft/Outlook accounts
  - SDK/Client: `github.com/markbates/goth/providers/microsoftonline`
  - Auth: `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`
  - Scopes: `User.Read`
  - Callback URL: Configured via `MICROSOFT_CALLBACK_URL` env var

**Provider Setup:**
- Location: `pkg/oauth/goth.go`
- Conditional activation: Providers only initialize when `ClientID` and `ClientSecret` environment variables are set
- Session management via `github.com/gorilla/sessions` with cookie store using `OAUTH_SESSION_SECRET`

## Data Storage

**Databases:**

**PostgreSQL (Primary):**
- Host/Port: Configured via `DB_HOST`, `DB_PORT` (default: localhost:5432)
- Credentials: `DB_USER`, `DB_PASSWORD` (default: postgres/postgres)
- Database name: `DB_NAME` (default: finance_app)
- SSL Mode: `DB_SSLMODE` (default: disable for dev, should be `require` in production)
- Client: `github.com/jackc/pgx/v5` driver
- ORM: GORM v1.31.1 (`gorm.io/gorm` with `gorm.io/driver/postgres`)
- Connection location: `pkg/database/postgres.go`
- Logger: GORM default logger with info-level logging
- Error translation: GORM's `TranslateError` enabled for database-specific error handling

**Docker Container (Development):**
- Image: `postgres:15-alpine`
- Container name: `finance_app_db`
- Port mapping: Host 5442 → Container 5432 (via `docker-compose.yml`)
- Volume: `postgres_data` persistent volume
- Health check: `pg_isready` with 10s interval, 5s timeout, 5 retries

**File Storage:**
- Local filesystem only - No S3 or external file storage integration

**Caching:**
- None detected

## Authentication & Identity

**Auth Provider:**
- Custom JWT-based authentication
- OAuth 2.0 via Google and Microsoft (optional)

**Implementation:**
- JWT token generation/validation in `internal/service/auth_service.go`
- Token configuration:
  - Secret: `JWT_SECRET` env var (default: "change-me-in-production")
  - Expiration: `JWT_EXPIRATION_HOURS` env var (default: 24 hours)
- Token delivery: Two methods supported
  - `Authorization: Bearer <token>` header
  - `auth_token` HttpOnly cookie (set after OAuth login)
- JWT v5 library: `github.com/golang-jwt/jwt/v5`
- Auth middleware: `internal/middleware/auth_middleware.go`
  - Extracts JWT from header or cookie
  - Injects `User` and `UserID` into request context via `pkg/appcontext`
  - Applied to all routes under `/api` group

**User Connections:**
- Users can invite other users for shared expense management
- External invite links via `external_id` field on users
- Relationship tracking in `UserConnection` domain with status enum (`pending`, `accepted`, `rejected`)

## Monitoring & Observability

**Error Tracking:**
- Custom error system in `pkg/errors/errors.go`
- `ErrorCode` enum and `ErrorTag` for fine-grained categorization
- `ServiceError` type with HTTP error conversion via `ToHTTPError()`
- Standardized error responses: `{"error": "error_code", "message": "human-readable message"}`

**Logs:**
- Echo middleware logging: `github.com/labstack/echo/v4/middleware` Logger()
- GORM logger: Info-level SQL logging configured in `pkg/database/postgres.go`
- Application logs: Standard `log` package usage in `cmd/server/main.go`

## CI/CD & Deployment

**Hosting:**
- Google Cloud Run (production target)
- Docker containers (local and cloud)

**Docker Images:**
- Development: `docker/Dockerfile.dev` - Live reload via bind mounts
- Production: `docker/Dockerfile` - Built from source

**CI Pipeline:**
- None detected in codebase

## Environment Configuration

**Required env vars (Production):**
- `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_SSLMODE`
- `JWT_SECRET` (CRITICAL: change from default)
- `OAUTH_SESSION_SECRET` (CRITICAL: change from default)
- At least one OAuth provider:
  - Google: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`
  - Microsoft: `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_CALLBACK_URL`
- `SERVER_HOST`, `SERVER_PORT`
- `APP_URL`, `FRONTEND_URL`
- `ENV` (set to "production" for conditional logic)

**Secrets Location:**
- `.env` file (development only, in `.gitignore`)
- Environment variables in cloud platform (Google Cloud Run secrets/Cloud SQL Proxy)
- Never committed to version control

**Development Example:**
- `.env.example` provided at `backend/.env.example` (no actual secrets)

## Webhooks & Callbacks

**Incoming:**
- OAuth callback endpoints: `GET /auth/:provider/callback`
  - Google: `/auth/google/callback`
  - Microsoft: `/auth/microsoft/callback`
- Callback URLs configured in respective OAuth provider consoles and via env vars

**Outgoing:**
- None detected

## Cross-Service Communication

**Internal Dependency Injection:**
- All services constructed in `cmd/server/main.go`
- `Services` struct depends on `Repositories` struct
- Circular dependencies resolved explicitly:
  - `TransactionService` depends on `Services` for cross-service calls
  - `UserConnectionService` depends on `Services` for cross-service calls

---

*Integration audit: 2026-04-09*
