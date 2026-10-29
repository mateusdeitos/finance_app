---
phase: 27-backend-crud-api
plan: 03
subsystem: api
tags: [go, echo, swagger, transaction-templates, idor, handler]

# Dependency graph
requires:
  - phase: 27-backend-crud-api (Plan 02)
    provides: TransactionTemplateService (interface + impl), Services.TransactionTemplate field, mock_TransactionTemplateService.go
provides:
  - Live HTTP endpoints at /api/transaction-templates (GET/POST/PUT/:id/DELETE/:id), authenticated via the existing api.Group RequireAuth middleware
  - TransactionTemplateHandler (4 Echo handlers, Swagger-annotated)
  - Regenerated Swagger docs (backend/docs/{docs.go,swagger.json,swagger.yaml}) reflecting the four endpoints and template DTO schemas
  - Handler test suite proving IDOR (context userID used even when body carries a spoofed user_id), 400/404/409 error mapping with tag preservation
affects: [27-04-backend-crud-api, 29-frontend-chip-apply-flow, 30-management-ui]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Thin handler: userID from appcontext.GetUserIDFromContext, c.Bind for the DTO, HandleServiceError for every service error (never echo.NewHTTPError for service errors, which would drop Tags)"

key-files:
  created:
    - backend/internal/handler/transaction_template_handler.go
    - backend/internal/handler/transaction_template_handler_test.go
  modified:
    - backend/cmd/server/main.go
    - backend/docs/docs.go
    - backend/docs/swagger.json
    - backend/docs/swagger.yaml

key-decisions:
  - "Update returns 204 No Content (no re-fetch) since there is no GET /:id endpoint in this phase's scope — matches the plan's explicit guidance"
  - "IDOR test proves the handler ignores a spoofed `user_id` in the Create request body: the DTO has no UserID field, so an extra JSON key is silently dropped by Go's lenient unmarshal, and the mock asserts the service receives the CONTEXT userID (42) regardless"

patterns-established: []

requirements-completed: [TMPL-02, TMPL-03, TMPL-04, SAFE-02]

# Metrics
duration: 3min
completed: 2026-07-08
---

# Phase 27 Plan 03: Backend CRUD API — HTTP Handler Layer Summary

**TransactionTemplateHandler with 4 Swagger-annotated Echo routes wired into main.go under the authenticated `/api/transaction-templates` group, backed by regenerated Swagger docs and a handler test suite proving IDOR (context-only userID) and tag-preserving error mapping (400/404/409).**

## Performance

- **Duration:** ~3 min (task work); commits span 2026-07-08T23:53:14Z → 2026-07-08T23:55:04Z
- **Started:** 2026-07-08T23:53:14Z
- **Completed:** 2026-07-08T23:55:04Z
- **Tasks:** 3/3 completed
- **Files modified:** 6 (2 created, 4 modified)

## Accomplishments

- Implemented `TransactionTemplateHandler` (`List`/`Create`/`Update`/`Delete`), each reading `userID` from `appcontext.GetUserIDFromContext` and using `HandleServiceError` for every service error so `TEMPLATE.*` tags reach the client
- Wired the repository, service, and handler into `cmd/server/main.go`: `Repositories.TransactionTemplate`, `services.TransactionTemplate`, `templateHandler`, `apiHandlers.template`, and the route group `api.Group("/transaction-templates")` with `GET`/`POST`/`PUT /:id`/`DELETE /:id`
- Regenerated Swagger docs (`swag init`, installed locally since `just`/`swag` weren't pre-installed) — `backend/docs/{docs.go,swagger.json,swagger.yaml}` now document all four endpoints plus the `TransactionTemplate`/`TransactionTemplatePayload`/`TransactionTemplateCreateRequest`/`TransactionTemplateUpdateRequest` schemas; the diff is purely additive (754 insertions, 0 deletions)
- Added `transaction_template_handler_test.go` (11 tests, all passing): List success + service-error mapping; Create success with IDOR proof (spoofed body `user_id` ignored, context userID 42 used) + bad-body 400 + `TEMPLATE.LIMIT_REACHED` 409 with tag preserved on the response `TaggedHTTPError`; Update invalid-id 400 (service never called) + owner-mismatch 404 + success 204; Delete not-found 404 + success 204 + invalid-id 400
- `go build ./...` and `go vet ./...` both pass; `gofmt -l` clean on all touched files

## Task Commits

Each task was committed atomically:

1. **Task 1: TransactionTemplateHandler (4 routes + Swagger annotations) + main.go wiring** - `005d91c` (feat)
2. **Task 2 [BLOCKING]: Regenerate Swagger docs** - `a0b5f79` (chore)
3. **Task 3: Handler tests (auth-context, bind, error mapping)** - `dd9b272` (test)

**Plan metadata:** (this commit, immediately following)

## Files Created/Modified

- `backend/internal/handler/transaction_template_handler.go` - New file: `TransactionTemplateHandler` struct + constructor + 4 Swagger-annotated Echo handlers
- `backend/cmd/server/main.go` - Added `TransactionTemplate` repo/service wiring, `templateHandler` construction, `apiHandlers.template` field/call-site, and the `/transaction-templates` route group registration
- `backend/docs/docs.go`, `backend/docs/swagger.json`, `backend/docs/swagger.yaml` - Regenerated via `swag init -g cmd/server/main.go --output docs --parseInternal`; additive-only diff
- `backend/internal/handler/transaction_template_handler_test.go` - New file: 11 tests covering auth-context userID (IDOR), bind failures, and service-error → HTTP status/tag mapping

## Decisions Made

- **PUT returns 204, not 200-with-body:** the plan explicitly notes there is no `GET /:id` endpoint in this phase's scope, so re-fetching the updated resource for a 200 response isn't possible without extra plumbing; 204 matches the `tag_handler`/`category_handler` precedent and is sufficient since the client already holds the full replacement payload it sent.
- **IDOR test technique:** `domain.TransactionTemplateCreateRequest` has no `UserID`/`user_id` field, so the test sends an extra unrecognized `"user_id":999` key in the JSON body (Go's default lenient unmarshal silently drops it) and asserts via the mock's typed expectation that `Create` was called with the CONTEXT userID (42) — proving the handler never reads ownership from the request, per T-27-01 in the plan's threat model.
- **Test naming:** functions are named `TestTransactionTemplateHandler_*` (not `TestTemplateHandler_*`) so the plan's verification command `go test ./internal/handler/ -run TransactionTemplate` matches them by substring.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Installed swag locally (not pre-installed)**
- **Found during:** Task 2 (Regenerate Swagger docs)
- **Issue:** `just` and `swag` were not available on PATH in this container; the plan's `just generate-docs` recipe could not run directly.
- **Fix:** Ran the recipe's underlying command manually — `go install github.com/swaggo/swag/cmd/swag@latest`, then `swag init -g cmd/server/main.go --output docs --parseInternal` from `backend/`, reproducing exactly what `just generate-docs` runs.
- **Files modified:** `backend/docs/docs.go`, `backend/docs/swagger.json`, `backend/docs/swagger.yaml`
- **Verification:** `grep -c '/transaction-templates' docs/swagger.json` = 2, `grep -c 'transaction-templates/{id}' docs/swagger.json` = 1, `go build ./docs/...` exits 0; `git diff --stat` confirms the change is purely additive (754 insertions, 0 deletions) — no unrelated endpoints were touched
- **Committed in:** `a0b5f79` (Task 2 commit)

### Notes on plan acceptance-criteria grep mismatches (non-issues)

These are literal-grep imprecisions in the plan text, not defects in the delivered code — documented for traceability, no fix needed:

- **`echo.NewHTTPError` count is 4, not "<= 3" as the plan's grep guessed.** All 4 occurrences are legitimate bind/param guards (Create bind, Update param-id guard, Update bind, Delete param-id guard) — none are used to translate a *service* error (every service error goes through `HandleServiceError`, confirmed by the `HandleServiceError` count also being exactly 4, one per handler method). The plan's threat-model intent (T-27-07: never strip Tags via a raw `echo.NewHTTPError` for a *service* error) is fully satisfied.
- **`grep -q 'template  *\*handler.TransactionTemplateHandler'` in main.go passes, but a literal single-space variant of the `TransactionTemplate: repository...` grep does not** — `gofmt` aligned the struct-literal field colons with two spaces (matching the longest field name `TransactionTemplate` in that literal), which is correct, required Go formatting; confirmed via `gofmt -l cmd/server/main.go` returning nothing (no diff needed).
- **`grep -q 'appcontext.WithUserID' transaction_template_handler_test.go` does not match** — the test file reuses the existing shared `injectUserCtx(req, userID)` helper (already defined once in `charge_handler_test.go`, same `handler` package) which itself calls `appcontext.WithUserID` internally. This is the established repo convention: `push_subscription_handler_test.go` does the same (calls `injectUserCtx`, never `appcontext.WithUserID` directly). Duplicating the helper's body inline would violate DRY and diverge from the codebase's own precedent.

**Total deviations:** 1 blocking-fix (swag install) + 3 documented grep-literal mismatches (no code changes warranted).
**Impact on plan:** No scope creep. All `<verification>` and `<success_criteria>` items in the plan (build, targeted tests, swagger content, authenticated route group) pass as specified.

## Issues Encountered

- `just`/`swag` were not on `PATH` in this container (same pattern as Plan 01's `mockery` and Plan 02's `mockery`). Installed `swag` directly via `go install` and ran its underlying command from `backend/`, reproducing `just generate-docs` exactly.
- Docker was not exercised — no testcontainers integration tests are part of this plan's scope; that is Plan 27-04 (cap race, IDOR 404, duplicate, validation, ordering, isolation). `go build ./...`, `go vet ./...`, and the handler unit-test suite were used to verify correctness as instructed by the environment notes.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- `/api/transaction-templates` is live end-to-end (repo → service → handler → routes) and documented in Swagger; ready for Plan 27-04's testcontainers integration suite to exercise the cap race, IDOR 404s, duplicate-name, validation, ordering, and isolation against a real PostgreSQL instance.
- Ready for Phase 29 (frontend chip apply flow) and Phase 30 (management UI) to consume the generated Swagger types once those phases begin.
- No blockers.

---
*Phase: 27-backend-crud-api*
*Completed: 2026-07-08*

## Self-Check: PASSED

All created/modified files found on disk (transaction_template_handler.go, transaction_template_handler_test.go, main.go, docs/swagger.json, docs/swagger.yaml, docs/docs.go, 27-03-SUMMARY.md); all task commit hashes (005d91c, a0b5f79, dd9b272) present in git log.
