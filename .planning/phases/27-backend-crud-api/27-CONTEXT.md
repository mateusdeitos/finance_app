# Phase 27: Backend CRUD API - Context

**Gathered:** 2026-06-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver the **HTTP CRUD layer** for transaction templates on top of the Phase 26 data foundation: repository + service + handler + route wiring + Swagger, exposed at `/api/transaction-templates`. Any authenticated user can **list / create / update / delete** their own templates; the API is **IDOR-scoped** (a user can never touch another user's template), **capped at 3 per user** with a **race-safe** rejection of the 4th, and the create/update path runs the payload through the strict `domain.TransactionTemplatePayload` write-boundary defined in Phase 26.

**In scope:**
- `TransactionTemplateRepository` (interface + impl) — list-by-user (created_at ASC), create with race-safe cap, get-by-id-scoped-to-user, update, delete; wired into `Repositories`.
- `TransactionTemplateService` (interface + impl) — IDOR enforcement (userID from auth context, never request), cap enforcement, payload unmarshal/marshal through the strict struct, basic field validation, duplicate-name rejection; wired into `Services`.
- `TransactionTemplateHandler` — 4 Echo routes (GET list, POST, PUT/:id, DELETE/:id) under an authenticated `api.Group("/transaction-templates")`.
- DTOs (request/response), error tags, mocks (`just generate-mocks`), Swagger (`just generate-docs`).

**Out of scope (later phases):** apply flow + existence/stale-ref silent-drop (Phase 29), `SplitSettingsFields` template mode UI (Phase 28), management UI / "save as template" (Phase 30), E2E (Phase 31). No `GET /:id` single-read endpoint (the 4 endpoints in the roadmap are the contract).

Requirements covered: **TMPL-02**, **TMPL-03**, **TMPL-04**, **SAFE-01**, **SAFE-02**.

</domain>

<decisions>
## Implementation Decisions

### Payload handling (write boundary)
- **D-01:** **Lenient unmarshal — drop unknown keys.** Create/update does NOT use `DisallowUnknownFields`. Any key not in `domain.TransactionTemplatePayload` (typos, stray `amount`/`date`, future fields) is silently ignored; only the canonical struct fields are re-serialized into the `payload` JSONB column. This resolves the strictness question P26 D-01b deferred to this phase, and aligns with the apply-time "silent drop" philosophy (P26 D-03). `amount`/`date` continue to drop naturally (P26 D-02) since they have no struct fields.
- **D-02:** **Canonical re-serialization on write.** After unmarshaling into the struct, the service marshals THAT struct back into the column (not the raw request body) — so storage is normalized regardless of incoming key order/extras. (P26 D-01 write path.)

### Validation (service layer — shape is not enough)
- **D-03:** **Basic field validation before save** (in addition to the lenient unmarshal):
  - `name` non-empty (with a sane max length — planner picks, follow existing string-field conventions).
  - `type` must be a valid `domain.TransactionType` (`expense`/`income`/`transfer`) — use the enum's `IsValid()`.
  - **Split rows internally consistent**: each `SplitSettings` row has **percentage XOR fixed-amount** (exactly one of `Percentage` / `Amount` set), matching the existing split-row shape. **No cross-row sum check** — templates carry no total amount, so percentage/amount totals cannot (and should not) be validated here.
  - **Still NO existence/referential checks** — account/category/tag ids are persisted as-is; validity is enforced at apply time on the frontend (P26 D-03). This phase never queries whether a referenced entity exists.
- **D-04:** Validation failures return `*ServiceError` with `VALIDATION_ERROR`/`BAD_REQUEST` codes and `TEMPLATE.*` tags (planner adds the constants in `pkg/errors/errors.go`, following the `DOMAIN.WHAT_HAPPENED` convention — e.g. `TEMPLATE.NAME_REQUIRED`, `TEMPLATE.INVALID_TYPE`, `TEMPLATE.INVALID_SPLIT_ROW`).

### Duplicate names
- **D-05:** **Reject duplicates — 409.** Keep the P26 `UNIQUE(user_id, name)` constraint. A duplicate name returns `ALREADY_EXISTS` with tag **`TEMPLATE.DUPLICATE_NAME`** (mirrors the `CATEGORY.DUPLICATE_NAME` precedent in `category_service.go`/`pkg/errors`). Service should check/translate the unique-violation rather than leak a raw DB error. No migration to drop the constraint.

### Update semantics
- **D-06:** **PUT = full replace.** A PUT to `/:id` overwrites the whole resource: new `name` + entire `payload` (including `tag_ids`, which makes the roadmap's "tag replacement" trivial since tags live inside the JSONB payload — there is no join table, P26 D-07). Frontend always sends the complete template. No PATCH/partial-update support this phase.

### IDOR & cap (locked by roadmap/requirements — restated for the implementer)
- **D-07:** **userID always comes from auth context, never the request body** — follow the push-subscription pattern (`Subscribe(ctx, userID, req)`, comment `SECURITY (IDOR): userID is the function argument from auth context — NEVER read from req`). Applies to every endpoint.
- **D-08:** **404 (not 403) on owner mismatch** (SAFE-02). Get/update/delete scope the query by `(id, user_id)`; a row that doesn't match the caller returns `NOT_FOUND`, never `FORBIDDEN` — so existence isn't leaked across users.
- **D-09:** **Cap = 3, race-safe (SAFE-01).** A create when the user already has 3 returns an error tagged **`TEMPLATE.LIMIT_REACHED`** (tag name locked by the roadmap success criteria). Hard delete frees a slot immediately (P26 D-06), so the count is always live.

### Claude's Discretion
- **Race-safe cap mechanism** — the roadmap locks "race-safe via conditional INSERT"; the exact SQL technique (single `INSERT ... SELECT ... WHERE (SELECT COUNT(*) ... ) < 3`, vs serializable tx, vs partial unique index on a per-user slot) is the **researcher/planner's** call. Whatever is chosen must guarantee two concurrent creates at count=2→3 can't both land a 4th, and must surface `TEMPLATE.LIMIT_REACHED` deterministically.
- DTO shape (`{name, payload:{...}}` vs flattened), response envelope, and HTTP success codes (201 on create, 200 on update, 204 on delete) — planner picks, matching existing handlers (charge/push-subscription).
- Whether the unique-violation is detected via a pre-check `SELECT` or by catching the DB constraint error — planner picks; if pre-check, keep it inside the same tx as the cap/insert to stay race-safe.
- `name` max length, exact validation tag names/messages, and Swagger annotation wording.
- GORM JSONB read/write technique already exists from P26 (`entity.TransactionTemplate` Scan/Value) — reuse as-is.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements
- `.planning/ROADMAP.md` §"Phase 27: Backend CRUD API" — goal + 5 success criteria (IDOR, race-safe cap, 404-on-mismatch, Swagger)
- `.planning/REQUIREMENTS.md` — TMPL-02/03/04, SAFE-01, SAFE-02 (+ traceability table)
- `.planning/PROJECT.md` §"Key Decisions" — locked v1.7 modeling decisions (dedicated table, opaque JSONB payload, apply-time validation, per-user 3-cap, private-per-owner)
- `.planning/phases/26-backend-foundation/26-CONTEXT.md` — D-01..D-11 (storage model, strict write-boundary intent, hard delete, isolation); this phase wires the strict unmarshal/marshal D-01b deferred to here

### Code (backend) — patterns to follow
- `backend/CLAUDE.md` — layered architecture, DI wiring (`Repositories`/`Services` structs + `cmd/server/main.go`), error handling (`pkg/errors`, `DOMAIN.WHAT` tags), handler thinness rules, Swagger annotations, `just generate-mocks` / `just generate-docs`, testcontainers testing
- `backend/internal/entity/transaction_template.go`, `backend/internal/domain/transaction_template.go` — the P26 types this phase reads/writes (entity Scan/Value, `TransactionTemplate` + `TransactionTemplatePayload`)
- `backend/internal/repository/push_subscription_repository.go` + `internal/service/push_subscription_service.go` + `internal/handler/push_subscription_handler.go` — most recent end-to-end CRUD slice; the IDOR `userID`-from-context pattern, service validation style, DTO/error conventions
- `backend/internal/service/category_service.go` + `pkg/errors/errors.go` (`ErrorTagDuplicateCategoryName`, `AlreadyExists`) — duplicate-name (409) precedent to mirror for `TEMPLATE.DUPLICATE_NAME`
- `backend/internal/repository/interfaces.go`, `backend/internal/service/interfaces.go` — where the new interfaces are declared; `cmd/server/main.go` (≈L223–294, the `api.Group(...)` blocks) — where the `/transaction-templates` group + handler get wired
- `backend/internal/repository/db_transaction.go` — `DBTransaction` Begin/Commit/Rollback via context, for the race-safe cap+insert if a tx is used
- `backend/internal/service/test_setup.go` / `test_setup_with_db.go` — unit (mockery) vs integration (testcontainers) suites; cap race-safety wants an integration/concurrency test

### Research (this milestone) — caveats
- `.planning/research/ARCHITECTURE.md` — layer pattern + build order (NOTE: its typed-column + `template_tags` join-table advice is SUPERSEDED by the opaque-payload model; use it only for the repo/service/handler/DI layering, not schema/tags)
- `.planning/research/PITFALLS.md` — isolation verification still applies; tag-join-table pitfalls are MOOT (tags live in payload)
- `.planning/research/SUMMARY.md`, `.planning/research/STACK.md` — zero new dependencies; idiomatic GORM

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `entity.TransactionTemplate` (P26) — ready-made GORM entity with JSONB `Payload` Scan/Value and `ToDomain()`/`FromDomain()`; the repository persists/reads it directly.
- Push-subscription slice (repo/service/handler) — closest structural analog for a small per-user resource; copy its IDOR signature, validation style, and route-group wiring.
- `pkg/errors` constructors (`AlreadyExists`, `Validation`, `BadRequest`, `NewWithTag`) + `ToHTTPError` at the handler boundary.

### Established Patterns
- `userID := appcontext.GetUserIDFromContext(...)` in the handler; services take `userID` as an explicit arg and **never** read it from the request (IDOR).
- domain↔entity round-trip (`entity.XxxFromDomain` / `(e *Xxx) ToDomain()`); never leak GORM types past the repository.
- Multi-step writes via `DBTransaction` flowing through context (relevant for the race-safe cap+insert).
- mocks via `just generate-mocks`; Swagger via `just generate-docs` (this phase DOES touch both — new interfaces + new handler annotations).

### Integration Points
- New interfaces added to `repository/interfaces.go` and `service/interfaces.go`; impls wired into the `Repositories` and `Services` structs in `cmd/server/main.go`.
- New `api.Group("/transaction-templates")` registered alongside the existing groups (accounts, charges, push-subscriptions, …) under the `RequireAuth` middleware.
- Isolation guarantee from P26 must hold: the new repository must NOT be joined into Search/GetBalance/settlement queries.

</code_context>

<specifics>
## Specific Ideas

- Endpoint set is exactly four: `GET /api/transaction-templates` (list, created_at ASC), `POST /api/transaction-templates`, `PUT /api/transaction-templates/:id`, `DELETE /api/transaction-templates/:id`. No `GET /:id`.
- Error tag set for this phase: `TEMPLATE.LIMIT_REACHED` (cap), `TEMPLATE.DUPLICATE_NAME` (409), plus validation tags (`TEMPLATE.NAME_REQUIRED`, `TEMPLATE.INVALID_TYPE`, `TEMPLATE.INVALID_SPLIT_ROW` or similar — planner finalizes names/messages).
- The cap race-safety deserves a concurrency-flavored integration test (two simultaneous creates at count=2) — only one should succeed, the other gets `TEMPLATE.LIMIT_REACHED`.

</specifics>

<deferred>
## Deferred Ideas

- `GET /api/transaction-templates/:id` single-read endpoint — not needed; the frontend works from the list. If a future surface needs it, add then.
- Server-side existence/referential validation of payload ids — intentionally NOT done; enforced at apply time on the frontend (P26 D-03).
- Raising/removing the 3-cap, reordering, shared templates — future milestone (REQUIREMENTS.md TMPL-F1..F5).

None — discussion stayed within Phase 27's CRUD-API scope.

</deferred>

---

*Phase: 27-backend-crud-api*
*Context gathered: 2026-06-14*
