# Phase 6: Charge Repository, Service & API (CRUD + Listing) - Research

**Researched:** 2026-04-14
**Domain:** Go backend — repository/service/handler layer for a new Charge aggregate
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

1. **Create request shape** — Caller declares `role` (`"charger"` or `"payer"`). Service resolves both parties from the connection. `my_account_id` is nullable.
2. **List endpoint** — Single `GET /api/charges` with query params: `direction` (sent/received/omit), `status` (pending/paid/rejected/cancelled/omit), `connection_id` (int/omit).
3. **Pending-count endpoint** — `GET /api/charges/pending-count` returns `{"count": N}`. Filters: payer == caller AND status == pending.
4. **Lifecycle routes** — `POST /api/charges/:id/cancel` (charger only) and `POST /api/charges/:id/reject` (payer only). `Accept` is Phase 7, not here.
5. **IDOR pattern** — 403 for all auth failures (never 404). Check existence first, then ownership.
6. **DI wiring** — `ChargeService` depends only on `*repository.Repositories`. Wire directly like SettlementService: `services.Charge = service.NewChargeService(repos)`. No cross-service calls in Phase 6.

### Claude's Discretion

- Internal struct field naming in `chargeService` (e.g., `chargeRepo`, `userConnectionRepo`)
- Exact field ordering in `ChargeSearchOptions`
- JSON tag naming on request structs (follow existing snake_case convention)
- Whether to use `lo.Map` or manual loop for entity-to-domain slice conversion

### Deferred Ideas (OUT OF SCOPE)

- `Accept` operation and atomic transfer creation (Phase 7)
- `ChargeID` on transactions (Phase 7)
- Frontend (Phase 8)
- Connection balance calculation (Phase 7)
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CHG-03 | User can create a charge linked to one of their active connections for a given period | ChargeService.Create validates connection status=accepted, resolves parties by role, calls chargeRepo.Create |
| CHG-05 | User can reject a pending charge received from a connected user | ChargeService.Reject: GetByID → ownership check (payer) → ValidateTransition → Update |
| CHG-06 | User (author only) can cancel a pending charge they created | ChargeService.Cancel: GetByID → ownership check (charger) → ValidateTransition → Update |
| CHG-08 | IDOR: only parties to the charge can view or act on it | Always 403 for non-party callers; Search always filters by UserID |
| CHG-12 | List charges authored (sent), filterable by status | ChargeSearchOptions.Direction="sent" + optional Status filter |
| CHG-13 | List charges received, filterable by status | ChargeSearchOptions.Direction="received" + optional Status filter |
| CHG-14 | Count of pending charges requiring caller's action | PendingCount service method → SELECT COUNT WHERE payer_user_id=callerID AND status=pending |
</phase_requirements>

---

## Summary

Phase 6 adds a complete Charge aggregate to the layered Go backend: repository interface + GORM implementation, service with business logic, five Echo handlers, and route registration. All patterns are directly observable in the existing codebase — no new libraries or patterns are introduced.

The closest analogue for the repository is `settlement_repository.go` (simple CRUD + search with a filter struct). The closest service analogue is `settlement_service.go` for the thin delegation pattern, supplemented by `user_connection_service.go` for the authorization + IDOR pattern. The handler exactly mirrors `user_connection_handler.go`.

The only non-obvious aspect is the `ChargeSearchOptions.UserID + Direction` combination for IDOR-safe listing, which must produce a GORM `WHERE (charger_user_id = ? OR payer_user_id = ?)` clause (for "all") or `WHERE charger_user_id = ?` / `WHERE payer_user_id = ?` (for "sent"/"received"). Everything else is a direct copy-adapt from existing files.

**Primary recommendation:** Model `ChargeRepository` after `SettlementRepository`, `ChargeService` after `settlement_service.go` + IDOR pattern from `user_connection_service.go`, and `ChargeHandler` after `user_connection_handler.go`.

---

## Standard Stack

All of the following are already present in `go.mod` — no new dependencies needed. [VERIFIED: codebase grep]

| Library | Purpose | Used In |
|---------|---------|---------|
| `gorm.io/gorm` | ORM / query builder | All repositories |
| `github.com/labstack/echo/v4` | HTTP router + context | All handlers |
| `github.com/samber/lo` | Slice helpers (`lo.Map`) | `user_connection_repository.go` |
| `github.com/finance_app/backend/pkg/errors` | Error constructors | All services |
| `github.com/finance_app/backend/pkg/appcontext` | `GetUserIDFromContext` | All handlers |
| `github.com/finance_app/backend/internal/entity` | GORM entity + ToDomain/FromDomain | All repositories |

---

## Architecture Patterns

### Recommended File Structure

```
backend/internal/
├── domain/charge.go                    # Already exists (Phase 5) — Charge, ChargeStatus, ValidateTransition, ChargeSearchOptions (ADD HERE)
├── entity/charge.go                    # Already exists (Phase 5) — entity.Charge, ToDomain, ChargeFromDomain
├── repository/
│   ├── interfaces.go                   # ADD: ChargeRepository interface; extend Repositories struct
│   └── charge_repository.go            # NEW: chargeRepository impl
├── service/
│   ├── interfaces.go                   # ADD: ChargeService interface; extend Services struct
│   └── charge_service.go               # NEW: chargeService impl
└── handler/
    └── charge_handler.go               # NEW: ChargeHandler + 5 methods
```

---

### Pattern 1: Repository Interface (in `repository/interfaces.go`)

Exact pattern to follow — `SettlementRepository` is the canonical model: [VERIFIED: codebase read]

```go
// Source: backend/internal/repository/interfaces.go (SettlementRepository, lines 89-94)
type SettlementRepository interface {
    Search(ctx context.Context, filter domain.SettlementFilter) ([]*domain.Settlement, error)
    Create(ctx context.Context, settlement *domain.Settlement) (*domain.Settlement, error)
    Update(ctx context.Context, settlement *domain.Settlement) error
    Delete(ctx context.Context, ids []int) error
}
```

**ChargeRepository interface to add:**

```go
type ChargeRepository interface {
    Create(ctx context.Context, charge *domain.Charge) (*domain.Charge, error)
    GetByID(ctx context.Context, id int) (*domain.Charge, error)
    Search(ctx context.Context, options domain.ChargeSearchOptions) ([]*domain.Charge, error)
    Update(ctx context.Context, charge *domain.Charge) error
}
```

GetByID is needed (not present on SettlementRepository) because the service must fetch a single charge by PK before authorizing cancel/reject operations. This matches the `AccountRepository` pattern which has both `GetByID` and `Search`.

---

### Pattern 2: `Repositories` Struct Extension

Current last line of the struct (line 108 of `repository/interfaces.go`): [VERIFIED: codebase read]

```go
// Repositories contains all repository interfaces
type Repositories struct {
    DBTransaction         DBTransaction
    User                  UserRepository
    UserSocial            UserSocialRepository
    Account               AccountRepository
    Category              CategoryRepository
    Tag                   TagRepository
    Transaction           TransactionRepository
    TransactionRecurrence TransactionRecurrenceRepository
    UserSettings          UserSettingsRepository
    UserConnection        UserConnectionRepository
    Settlement            SettlementRepository
    Charge                ChargeRepository   // ADD THIS LINE
}
```

---

### Pattern 3: Repository Implementation (`charge_repository.go`)

Model directly after `settlement_repository.go`. Key points: [VERIFIED: codebase read]

- Private struct `chargeRepository` with `db *gorm.DB`
- Constructor returns the interface type: `func NewChargeRepository(db *gorm.DB) ChargeRepository`
- All methods call `GetTxFromContext(ctx, r.db)` — this is the transaction-aware DB accessor
- `Create`: `entity.ChargeFromDomain(charge)` → `.Create(ent)` → return `ent.ToDomain()`
- `Update`: `entity.ChargeFromDomain(charge)` → `.Save(ent)` — note: `Save` not `Updates`
- `GetByID`: `.First(&ent, id)` — returns `nil, nil` when not found or wrap gorm.ErrRecordNotFound
- `Search`: build `query` with chained `.Where(...)` calls, then `.Find(&ents)`

**GetByID pattern** (from `account_repository.go`): [VERIFIED: codebase grep]

```go
func (r *chargeRepository) GetByID(ctx context.Context, id int) (*domain.Charge, error) {
    var ent entity.Charge
    if err := GetTxFromContext(ctx, r.db).First(&ent, id).Error; err != nil {
        return nil, err
    }
    return ent.ToDomain(), nil
}
```

Note: `gorm.ErrRecordNotFound` is returned as the raw error from `First`. The service layer wraps it with `pkgErrors.NotFound("charge")`.

**Search pattern** (chargeSearchOptions-driven GORM query):

```go
func (r *chargeRepository) Search(ctx context.Context, options domain.ChargeSearchOptions) ([]*domain.Charge, error) {
    var ents []entity.Charge
    query := GetTxFromContext(ctx, r.db)

    if options.Limit > 0 {
        query = query.Limit(options.Limit)
    }
    if options.Offset > 0 {
        query = query.Offset(options.Offset)
    }

    // IDOR gate: UserID must always be set
    if options.UserID > 0 {
        switch options.Direction {
        case "sent":
            query = query.Where("charger_user_id = ?", options.UserID)
        case "received":
            query = query.Where("payer_user_id = ?", options.UserID)
        default:
            query = query.Where("(charger_user_id = ? OR payer_user_id = ?)", options.UserID, options.UserID)
        }
    }

    if options.Status != "" {
        query = query.Where("status = ?", options.Status)
    }
    if options.ConnectionID > 0 {
        query = query.Where("connection_id = ?", options.ConnectionID)
    }

    if err := query.Find(&ents).Error; err != nil {
        return nil, err
    }

    result := make([]*domain.Charge, len(ents))
    for i, ent := range ents {
        result[i] = ent.ToDomain()
    }
    return result, nil
}
```

**Count query for PendingCount** — the repository can expose a separate `Count` method or the service can call `Search` and use `len`. Preferred pattern: add a `Count(ctx, options)` method returning `int64` to avoid loading full rows. But since `SettlementRepository` has no Count, the simpler approach is `Search` with no limit and return `len`. Either is valid — the planner should pick. The simplest approach matching existing patterns is a dedicated `Count` query:

```go
func (r *chargeRepository) Count(ctx context.Context, options domain.ChargeSearchOptions) (int64, error) {
    var count int64
    query := GetTxFromContext(ctx, r.db).Model(&entity.Charge{})
    // apply same where clauses as Search (without limit/offset)
    ...
    return count, query.Count(&count).Error
}
```

If `Count` is added to the interface, `just generate-mocks` will auto-generate `MockChargeRepository.Count`. This is the recommended approach for correctness at scale.

---

### Pattern 4: `ChargeSearchOptions` Struct (add to `domain/charge.go`)

Model after `UserConnectionSearchOptions` in `domain/user_connection.go`: [VERIFIED: codebase read]

```go
// Source: backend/internal/domain/user_connection.go (lines 38-49)
type UserConnectionSearchOptions struct {
    Limit            int                      `json:"limit"`
    Offset           int                      `json:"offset"`
    IDs              []int                    `json:"ids"`
    FromUserIDs      []int                    `json:"from_user_ids"`
    ToUserIDs        []int                    `json:"to_user_ids"`
    ...
    ConnectionStatus UserConnectionStatusEnum `json:"connection_status"`
    SortBy           *SortBy                  `json:"sort_by"`
}
```

**ChargeSearchOptions to define:**

```go
type ChargeSearchOptions struct {
    UserID       int          `json:"user_id"`        // IDOR gate — always required in service
    Direction    string       `json:"direction"`      // "sent" | "received" | "" (all)
    Status       ChargeStatus `json:"status"`         // "" means no filter
    ConnectionID int          `json:"connection_id"`  // 0 means no filter
    Limit        int          `json:"limit"`
    Offset       int          `json:"offset"`
}
```

Notes:
- `UserID` is an `int` not `[]int` because the IDOR constraint is always a single caller's ID, not a set.
- `Direction` is `string` (not an enum type) because it's only used in one place. If the codebase grows, a `ChargeDirection` type can be introduced. [ASSUMED — design choice, matches `ConnectionStatus` approach of using the underlying type directly]
- `Status` uses `ChargeStatus` (already defined in `domain/charge.go`) for type safety.
- `SortBy` is omitted — no sort requirement in Phase 6. Can be added later.
- The handler binds query params to this struct via `c.Bind(&options)`. Echo's default binder maps `query` params to struct fields using `json` tags.

---

### Pattern 5: Service Interface (in `service/interfaces.go`)

Current `Services` struct ends at line 83. [VERIFIED: codebase read]

```go
// Add to service/interfaces.go
type ChargeService interface {
    Create(ctx context.Context, callerUserID int, req *domain.CreateChargeRequest) (*domain.Charge, error)
    Cancel(ctx context.Context, callerUserID, chargeID int) error
    Reject(ctx context.Context, callerUserID, chargeID int) error
    List(ctx context.Context, options domain.ChargeSearchOptions) ([]*domain.Charge, error)
    PendingCount(ctx context.Context, callerUserID int) (int64, error)
}

// Extend Services struct:
type Services struct {
    Auth           AuthService
    User           UserService
    Account        AccountService
    Category       CategoryService
    Tag            TagService
    Transaction    TransactionService
    UserConnection UserConnectionService
    Settlement     SettlementService
    Charge         ChargeService   // ADD THIS LINE
}
```

**`domain.CreateChargeRequest`** must also be defined in `domain/charge.go`:

```go
type CreateChargeRequest struct {
    ConnectionID int    `json:"connection_id"`
    Role         string `json:"role"`           // "charger" | "payer"
    MyAccountID  *int   `json:"my_account_id"`  // nullable
    PeriodMonth  int    `json:"period_month"`
    PeriodYear   int    `json:"period_year"`
    Description  *string `json:"description"`
}
```

---

### Pattern 6: Service Implementation (`charge_service.go`)

Thin wrapper following `settlement_service.go`. For Phase 6 it needs:
- `chargeRepo repository.ChargeRepository`
- `userConnectionRepo repository.UserConnectionRepository` (to validate connection is accepted and look up both parties)

Constructor:
```go
type chargeService struct {
    chargeRepo         repository.ChargeRepository
    userConnectionRepo repository.UserConnectionRepository
}

func NewChargeService(repos *repository.Repositories) ChargeService {
    return &chargeService{
        chargeRepo:         repos.Charge,
        userConnectionRepo: repos.UserConnection,
    }
}
```

**Create method** (business logic per CONTEXT.md):

```go
func (s *chargeService) Create(ctx context.Context, callerUserID int, req *domain.CreateChargeRequest) (*domain.Charge, error) {
    // 1. Fetch connection
    conns, err := s.userConnectionRepo.Search(ctx, domain.UserConnectionSearchOptions{
        IDs: []int{req.ConnectionID},
    })
    if err != nil {
        return nil, pkgErrors.Internal("failed to fetch connection", err)
    }
    if len(conns) == 0 {
        return nil, pkgErrors.NotFound("connection")
    }
    conn := conns[0]

    // 2. Validate connection is accepted
    if conn.ConnectionStatus != domain.UserConnectionStatusAccepted {
        return nil, pkgErrors.BadRequest("connection is not accepted")
    }

    // 3. Validate caller is a party
    if conn.FromUserID != callerUserID && conn.ToUserID != callerUserID {
        return nil, pkgErrors.Forbidden("caller is not a party to this connection")
    }

    // 4. Resolve charger/payer by role
    var otherPartyID int
    if conn.FromUserID == callerUserID {
        otherPartyID = conn.ToUserID
    } else {
        otherPartyID = conn.FromUserID
    }

    charge := &domain.Charge{
        ConnectionID: req.ConnectionID,
        PeriodMonth:  req.PeriodMonth,
        PeriodYear:   req.PeriodYear,
        Description:  req.Description,
        Status:       domain.ChargeStatusPending,
    }
    if req.Role == "charger" {
        charge.ChargerUserID = callerUserID
        charge.PayerUserID = otherPartyID
        charge.ChargerAccountID = req.MyAccountID
    } else { // "payer"
        charge.PayerUserID = callerUserID
        charge.ChargerUserID = otherPartyID
        charge.PayerAccountID = req.MyAccountID
    }

    return s.chargeRepo.Create(ctx, charge)
}
```

**Cancel/Reject method** (shared authorization pattern):

```go
func (s *chargeService) Cancel(ctx context.Context, callerUserID, chargeID int) error {
    charge, err := s.chargeRepo.GetByID(ctx, chargeID)
    if err != nil {
        return pkgErrors.NotFound("charge")
    }

    // IDOR: is caller a party?
    if charge.ChargerUserID != callerUserID && charge.PayerUserID != callerUserID {
        return pkgErrors.Forbidden("charge")
    }

    // Role check
    if charge.ChargerUserID != callerUserID {
        return pkgErrors.Forbidden("only the charger can cancel")
    }

    // Status transition
    if err := charge.ValidateTransition(domain.ChargeStatusCancelled); err != nil {
        return pkgErrors.BadRequest(err.Error())
    }

    charge.Status = domain.ChargeStatusCancelled
    if err := s.chargeRepo.Update(ctx, charge); err != nil {
        return pkgErrors.Internal("failed to cancel charge", err)
    }
    return nil
}
```

Reject mirrors Cancel but checks `PayerUserID` and transitions to `ChargeStatusRejected`.

**IDOR ordering critical:** Always check IDOR (is caller a party at all?) BEFORE role check. This ensures non-parties get 403 for a charge they are not involved with, not just for the wrong role.

**List method:**

```go
func (s *chargeService) List(ctx context.Context, options domain.ChargeSearchOptions) ([]*domain.Charge, error) {
    results, err := s.chargeRepo.Search(ctx, options)
    if err != nil {
        return nil, pkgErrors.Internal("failed to list charges", err)
    }
    return results, nil
}
```

**PendingCount method:**

```go
func (s *chargeService) PendingCount(ctx context.Context, callerUserID int) (int64, error) {
    count, err := s.chargeRepo.Count(ctx, domain.ChargeSearchOptions{
        UserID:    callerUserID,
        Direction: "received",
        Status:    domain.ChargeStatusPending,
    })
    if err != nil {
        return 0, pkgErrors.Internal("failed to count pending charges", err)
    }
    return count, nil
}
```

---

### Pattern 7: Handler (`charge_handler.go`)

Exactly mirrors `user_connection_handler.go`. [VERIFIED: codebase read]

```go
package handler

import (
    "net/http"
    "strconv"

    "github.com/finance_app/backend/internal/domain"
    "github.com/finance_app/backend/internal/service"
    "github.com/finance_app/backend/pkg/appcontext"
    "github.com/labstack/echo/v4"
)

type ChargeHandler struct {
    chargeService service.ChargeService
}

func NewChargeHandler(services *service.Services) *ChargeHandler {
    return &ChargeHandler{
        chargeService: services.Charge,
    }
}
```

**Create handler:**

```go
func (h *ChargeHandler) Create(c echo.Context) error {
    userID := appcontext.GetUserIDFromContext(c.Request().Context())

    var req domain.CreateChargeRequest
    if err := c.Bind(&req); err != nil {
        return echo.NewHTTPError(http.StatusBadRequest, "invalid request body")
    }

    charge, err := h.chargeService.Create(c.Request().Context(), userID, &req)
    if err != nil {
        return HandleServiceError(err)
    }

    return c.JSON(http.StatusCreated, charge)
}
```

**List handler** (query params bound via `c.Bind`):

```go
func (h *ChargeHandler) List(c echo.Context) error {
    userID := appcontext.GetUserIDFromContext(c.Request().Context())

    var options domain.ChargeSearchOptions
    if err := c.Bind(&options); err != nil {
        return echo.NewHTTPError(http.StatusBadRequest, "invalid query parameters")
    }
    // Force IDOR gate — caller can only see their own charges
    options.UserID = userID

    charges, err := h.chargeService.List(c.Request().Context(), options)
    if err != nil {
        return HandleServiceError(err)
    }

    return c.JSON(http.StatusOK, map[string]interface{}{"charges": charges})
}
```

**PendingCount handler:**

```go
func (h *ChargeHandler) PendingCount(c echo.Context) error {
    userID := appcontext.GetUserIDFromContext(c.Request().Context())

    count, err := h.chargeService.PendingCount(c.Request().Context(), userID)
    if err != nil {
        return HandleServiceError(err)
    }

    return c.JSON(http.StatusOK, map[string]int64{"count": count})
}
```

**Cancel handler:**

```go
func (h *ChargeHandler) Cancel(c echo.Context) error {
    userID := appcontext.GetUserIDFromContext(c.Request().Context())

    id, err := strconv.Atoi(c.Param("id"))
    if err != nil {
        return echo.NewHTTPError(http.StatusBadRequest, "invalid charge ID")
    }

    if err := h.chargeService.Cancel(c.Request().Context(), userID, id); err != nil {
        return HandleServiceError(err)
    }

    return c.NoContent(http.StatusNoContent)
}
```

Reject mirrors Cancel but calls `h.chargeService.Reject`.

**`HandleServiceError` is already defined** in `backend/internal/handler/errors.go` — calls `pkgErrors.ToHTTPError(err)`. Use it for all service errors (NOT `echo.NewHTTPError`). This ensures `ServiceError` codes map to correct HTTP status codes (403→Forbidden, 404→NotFound, 400→BadRequest, 500→Internal). [VERIFIED: codebase read]

---

### Pattern 8: Route Registration in `main.go`

The exact insertion point is after the transactions group (line ~179) and before the server start (line ~181). [VERIFIED: codebase read]

```go
// In main.go — after existing handler initializations:
chargeHandler := handler.NewChargeHandler(services)

// After transactions route group, before server start:
charges := api.Group("/charges")
charges.POST("", chargeHandler.Create)
charges.GET("", chargeHandler.List)
charges.GET("/pending-count", chargeHandler.PendingCount)
charges.POST("/:id/cancel", chargeHandler.Cancel)
charges.POST("/:id/reject", chargeHandler.Reject)
```

**Route ordering gotcha:** `GET /charges/pending-count` MUST be registered before `GET /charges/:id` if a parameterized GetByID route is ever added. Echo matches routes in registration order for same-method prefix conflicts. Currently no `/:id` GET exists in Phase 6, so no issue — but the planner should note this for future phases.

---

### Pattern 9: Wiring in `main.go`

Two changes needed: [VERIFIED: codebase read]

**1. Repos struct literal** (lines 61-73):
```go
repos := &repository.Repositories{
    // ... existing fields ...
    Settlement: repository.NewSettlementRepository(db),
    Charge:     repository.NewChargeRepository(db),  // ADD
}
```

**2. Services initialization block** (lines 76-87):
```go
services := &service.Services{
    Auth:       service.NewAuthService(repos, cfg),
    User:       service.NewUserService(repos),
    Account:    service.NewAccountService(repos),
    Category:   service.NewCategoryService(repos),
    Tag:        service.NewTagService(repos),
    Settlement: service.NewSettlementService(repos),
    Charge:     service.NewChargeService(repos),     // ADD (no circular dep — repos only)
}

services.UserConnection = service.NewUserConnectionService(repos, services)
services.Transaction = service.NewTransactionService(repos, services)
```

`Charge` goes inside the struct literal (not after like `UserConnection`/`Transaction`) because it has no cross-service dependency on `*Services`. [VERIFIED: CONTEXT.md decision + codebase pattern]

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Transaction-aware DB | Manual ctx threading | `GetTxFromContext(ctx, r.db)` | Already exists in `repository/db_transaction.go` |
| HTTP error mapping | Custom status switch | `HandleServiceError(err)` + `pkgErrors.ToHTTPError` | Already in `handler/errors.go` |
| Entity↔Domain conversion | Manual field copy | `entity.ChargeFromDomain` + `ent.ToDomain()` | Already in `entity/charge.go` |
| Mock generation | Hand-written mocks | `just generate-mocks` | mockery reads interfaces automatically from `repository` + `service` packages |
| Swagger docs | Manual OpenAPI editing | `just generate-docs` | swag reads handler annotations |

---

## Common Pitfalls

### Pitfall 1: Using `echo.NewHTTPError` instead of `HandleServiceError` for service errors

**What goes wrong:** Service returns `pkgErrors.Forbidden(...)` with `ErrCodeForbidden`. If the handler calls `echo.NewHTTPError(http.StatusBadRequest, err.Error())`, the client gets 400 instead of 403. Existing handlers like `user_connection_handler.go` inconsistently use both — the newer ones (post `GetInviteInfo`) use `HandleServiceError`.

**How to avoid:** For all service calls in ChargeHandler, always use `HandleServiceError(err)`. Never use `echo.NewHTTPError` for service errors.

**Warning signs:** Test returns wrong HTTP status code despite correct service error.

---

### Pitfall 2: IDOR check order — existence before ownership

**What goes wrong:** If ownership is checked before existence (e.g., `charge.ChargerUserID != callerUserID` when charge is nil), the service panics or returns a nil pointer dereference.

**How to avoid:** Always check `GetByID` error first → return `pkgErrors.NotFound` → THEN check ownership. Per CONTEXT.md, always return 403 for non-parties (not 404), but the code must still handle "not found at all" vs "found but not yours".

---

### Pitfall 3: `ChargeSearchOptions.UserID` not set in handler

**What goes wrong:** If the handler passes `options` directly from `c.Bind` without setting `options.UserID = userID`, a user could list ALL charges in the table.

**How to avoid:** After `c.Bind(&options)`, always set `options.UserID = userID` before calling the service. The service/repo trusts the options struct but the handler owns the IDOR gate for the list endpoint.

---

### Pitfall 4: `pending-count` route shadowed by future `/:id` route

**What goes wrong:** If a `GET /charges/:id` route is added later and registered before `GET /charges/pending-count`, Echo will match `/charges/pending-count` as `id="pending-count"` before reaching the correct handler.

**How to avoid:** Register static routes (`/pending-count`) before parameterized routes (`/:id`) within the same group. Phase 6 has no `/:id` GET, so this is a future consideration only.

---

### Pitfall 5: `lo.Map` import vs manual loop

**What goes wrong:** `user_connection_repository.go` imports `github.com/samber/lo` for slice mapping. `settlement_repository.go` uses a manual loop. Both are valid. Mixing styles is fine but the planner should pick one.

**How to avoid:** Use `lo.Map` if you want to match `user_connection_repository.go`; use a manual loop if you want to match `settlement_repository.go`. Either compiles. `lo` is already in go.mod. [VERIFIED: codebase grep]

---

### Pitfall 6: Forgetting to run `just generate-mocks` after adding interfaces

**What goes wrong:** New `ChargeRepository` and `ChargeService` interfaces exist but their mocks are absent. Any test file that imports `mocks.MockChargeRepository` will fail to compile.

**How to avoid:** The `.mockery.yaml` config scans all interfaces in `internal/repository` and `internal/service` with `all: true`. Running `just generate-mocks` after adding the interfaces will produce `mocks/mock_ChargeRepository.go` and `mocks/mock_ChargeService.go` automatically. [VERIFIED: `.mockery.yaml` read]

---

## Code Examples

### `GetTxFromContext` (repository transaction helper)

```go
// Source: backend/internal/repository/db_transaction.go (lines 18-24)
func GetTxFromContext(ctx context.Context, db *gorm.DB) *gorm.DB {
    tx, ok := ctx.Value("tx").(*gorm.DB)
    if !ok {
        return db.WithContext(ctx)
    }
    return tx
}
```

### Error constructors in `pkg/errors`

```go
// Source: backend/pkg/errors/errors.go (lines 303-342)
pkgErrors.NotFound("charge")             // → 404
pkgErrors.Forbidden("only the charger can cancel") // → 403
pkgErrors.BadRequest("connection is not accepted") // → 400
pkgErrors.Internal("failed to create charge", err) // → 500
```

### `GetUserIDFromContext` in handlers

```go
// Source: backend/pkg/appcontext/appcontext.go (lines 32-38)
userID := appcontext.GetUserIDFromContext(c.Request().Context())
```

### Entity `BeforeCreate` / `BeforeUpdate` hooks

```go
// Source: backend/internal/entity/charge.go (lines 25-35)
// Both hooks already defined — timestamps managed automatically
func (Charge) BeforeCreate(tx *gorm.DB) error { ... }
func (c *Charge) BeforeUpdate(tx *gorm.DB) error { ... }
```

No manual timestamp setting needed in the repository — GORM hooks handle it.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `Direction` field uses plain `string` not a named type | ChargeSearchOptions design | Minor — named type is strictly better but not required; can add later |
| A2 | `PendingCount` uses a dedicated `Count` repo method rather than `len(Search(...))` | Pattern 6 + repository interface | If planner uses `len(Search)`, it loads full rows; acceptable for low volume but inefficient at scale |
| A3 | `CreateChargeRequest` is defined in `domain/charge.go` rather than inline in the handler | Pattern 5 | Minor — inline handler struct would also work; domain placement matches `domain.TransactionCreateRequest` convention |
| A4 | Route ordering for `pending-count` is safe in Phase 6 | Pattern 8 | No risk in Phase 6; risk emerges only if Phase 7 adds `GET /:id` and registers it first |

---

## Open Questions

1. **`Count` on `ChargeRepository` interface or not?**
   - What we know: `PendingCount` needs a count query; existing repos don't have `Count` methods
   - What's unclear: Whether to add `Count(ctx, options) (int64, error)` to the interface or call `Search` + `len`
   - Recommendation: Add `Count` to the interface. Avoids loading full rows. Small overhead in mock but `just generate-mocks` handles it.

2. **`role` field validation in service or handler?**
   - What we know: CONTEXT.md shows `role` as `"charger"` or `"payer"` string values
   - What's unclear: Where to validate (handler vs service)
   - Recommendation: Validate in service (`if req.Role != "charger" && req.Role != "payer" { return pkgErrors.BadRequest(...) }`) — consistent with how other validation happens in service layer.

---

## Environment Availability

Step 2.6: SKIPPED — Phase 6 is purely code changes within the existing Go backend. No external tools beyond those already used by the project are required. `just generate-mocks` and `just generate-docs` are existing project commands. [VERIFIED: CLAUDE.md + `.mockery.yaml`]

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Go testing + testify + testcontainers |
| Config file | `backend/internal/service/test_setup_with_db.go` |
| Quick run command | `go test ./internal/service/ -run TestChargeService -short` |
| Full suite command | `go test -tags=integration ./internal/service/ -run TestChargeService` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CHG-03 | Create charge — happy path | integration | `go test -tags=integration ./internal/service/ -run TestChargeService/TestCreate` | ❌ Wave 0 |
| CHG-03 | Create charge — connection not accepted | integration | `go test -tags=integration ./internal/service/ -run TestChargeService/TestCreate_ConnectionNotAccepted` | ❌ Wave 0 |
| CHG-03 | Create charge — caller not in connection | integration | `go test -tags=integration ./internal/service/ -run TestChargeService/TestCreate_CallerNotInConnection` | ❌ Wave 0 |
| CHG-05 | Reject — payer rejects successfully | integration | `go test -tags=integration ./internal/service/ -run TestChargeService/TestReject` | ❌ Wave 0 |
| CHG-05 | Reject — charger cannot reject | integration | `go test -tags=integration ./internal/service/ -run TestChargeService/TestReject_WrongParty` | ❌ Wave 0 |
| CHG-06 | Cancel — charger cancels successfully | integration | `go test -tags=integration ./internal/service/ -run TestChargeService/TestCancel` | ❌ Wave 0 |
| CHG-06 | Cancel — payer cannot cancel | integration | `go test -tags=integration ./internal/service/ -run TestChargeService/TestCancel_WrongParty` | ❌ Wave 0 |
| CHG-08 | Non-party gets 403 on cancel/reject | integration | `go test -tags=integration ./internal/service/ -run TestChargeService/TestIDOR` | ❌ Wave 0 |
| CHG-12 | List — direction=sent returns only charger charges | integration | `go test -tags=integration ./internal/service/ -run TestChargeService/TestList_Sent` | ❌ Wave 0 |
| CHG-13 | List — direction=received returns only payer charges | integration | `go test -tags=integration ./internal/service/ -run TestChargeService/TestList_Received` | ❌ Wave 0 |
| CHG-14 | PendingCount — returns correct count | integration | `go test -tags=integration ./internal/service/ -run TestChargeService/TestPendingCount` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `go test ./internal/service/ -run TestChargeService -short`
- **Per wave merge:** `go test -tags=integration ./internal/service/ -run TestChargeService`
- **Phase gate:** `just test` (full suite green before `/gsd-verify-work`)

### Wave 0 Gaps

- [ ] `backend/internal/service/charge_service_test.go` — covers all CHG-* requirements above
- [ ] Test helper `createTestCharge(...)` method on `ServiceTestWithDBSuite` — needed by multiple test cases

Existing infrastructure (`ServiceTestWithDBSuite`, `createTestUser`, `createAcceptedTestUserConnection`) is sufficient as the scaffolding base — only the charge-specific test file and helper are missing.

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Existing `AuthMiddleware` — JWT extracted before reaching handlers |
| V3 Session Management | no | Stateless JWT — no session state in charges |
| V4 Access Control | yes | IDOR gate: `ChargerUserID == callerID OR PayerUserID == callerID`; always 403 for non-parties |
| V5 Input Validation | yes | `role` validation, `connection_id` > 0, `period_month` 1-12, `period_year` sanity check in service |
| V6 Cryptography | no | No cryptographic operations in this phase |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| IDOR — access another user's charge by guessing ID | Elevation of Privilege | Service always checks caller is ChargerUserID or PayerUserID; returns 403 not 404 |
| Role manipulation — payer sends `role=charger` to flip roles | Tampering | Role is used only at creation time to set `ChargerUserID`/`PayerUserID`; subsequent mutations check stored DB fields, not user-supplied role |
| Double cancel/reject race | Tampering | `ValidateTransition` in domain layer rejects non-pending → non-terminal transitions; GORM `Save` is last-write-wins but both writes produce same terminal state |

---

## Sources

### Primary (HIGH confidence)
- `backend/internal/repository/interfaces.go` — Repositories struct, all existing repository interfaces
- `backend/internal/service/interfaces.go` — Services struct, all existing service interfaces
- `backend/internal/repository/user_connection_repository.go` — Search/Create/Update/Delete pattern with GORM
- `backend/internal/repository/settlement_repository.go` — Minimal CRUD + Search pattern
- `backend/internal/service/settlement_service.go` — Thin service wrapper pattern
- `backend/internal/service/user_connection_service.go` — Authorization/IDOR pattern in service layer
- `backend/internal/handler/user_connection_handler.go` — Handler constructor, `c.Bind`, `appcontext.GetUserIDFromContext`, `HandleServiceError`
- `backend/cmd/server/main.go` — Wiring pattern, route group registration
- `backend/internal/domain/charge.go` — Charge struct, ChargeStatus constants, `ValidateTransition`
- `backend/internal/entity/charge.go` — GORM entity, `ToDomain`, `ChargeFromDomain`, hooks
- `backend/pkg/errors/errors.go` — All error constructors: `NotFound`, `Forbidden`, `BadRequest`, `Internal`, `ToHTTPError`
- `backend/pkg/appcontext/appcontext.go` — `GetUserIDFromContext`
- `backend/internal/handler/errors.go` — `HandleServiceError`
- `backend/.mockery.yaml` — Mock generation config

### Secondary (MEDIUM confidence)
- `backend/internal/domain/user_connection.go` — `UserConnectionSearchOptions` as template for `ChargeSearchOptions`

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already in go.mod, verified by codebase read
- Architecture patterns: HIGH — all patterns directly observed in existing production files
- ChargeSearchOptions design: HIGH for field names/types; MEDIUM for `Direction` as plain string (design choice)
- Pitfalls: HIGH — all identified from direct code inspection

**Research date:** 2026-04-14
**Valid until:** 2026-05-14 (stable Go codebase, no fast-moving dependencies)
