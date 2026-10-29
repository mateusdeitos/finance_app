# Phase 27: Backend CRUD API - Pattern Map

**Mapped:** 2026-07-07
**Files analyzed:** 9 (create/modify units; DTOs and mocks/swagger counted under their host files)
**Analogs found:** 9 / 9 (1 partial — race-safe cap+insert has no exact precedent, composed from two analogs)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `backend/internal/repository/transaction_template_repository.go` (new) | repository | CRUD (+ race-safe insert) | `backend/internal/repository/notification_repository.go` (List/scoped-delete) + `backend/internal/repository/charge_repository.go` (`ConditionalAccept` race-guard) | role-match (composed) |
| `backend/internal/repository/interfaces.go` (modify) | interface decl | — | same file, `PushSubscriptionRepository`/`NotificationRepository` blocks | exact |
| `backend/internal/service/transaction_template_service.go` (new) | service | CRUD + validation | `backend/internal/service/push_subscription_service.go` (IDOR arg) + `backend/internal/service/category_service.go` (tx-wrapped write + duplicate-name check) | exact (composed) |
| `backend/internal/service/interfaces.go` (modify) | interface decl | — | same file, `PushSubscriptionService`/`CategoryService` blocks | exact |
| `backend/internal/handler/transaction_template_handler.go` (new) | handler | request-response | `backend/internal/handler/notification_handler.go` | exact |
| `backend/pkg/errors/errors.go` (modify) | error tags | — | `ErrorTagDuplicateCategoryName` / `ErrImportEmptyFile` blocks in same file | exact |
| `cmd/server/main.go` (modify) | DI wiring / routing | — | Push-subscription and Notification wiring blocks (same file) | exact |
| DTOs (request/response) | model | — | `backend/internal/domain/push_subscription.go` (`SubscribePushRequest`) vs `backend/internal/domain/tag.go`-style direct domain bind | role-match (two valid options, see below) |
| mocks / Swagger | generated | — | `just generate-mocks`, `just generate-docs` (no manual pattern) | n/a |

## Pattern Assignments

### `backend/internal/repository/transaction_template_repository.go` (new)

**Primary analog:** `backend/internal/repository/notification_repository.go` (IDOR-scoped List/MarkRead/Delete via `RowsAffected`)
**Secondary analog (race-safe write):** `backend/internal/repository/charge_repository.go` (`ConditionalAccept`)

**Imports pattern** (notification_repository.go lines 1-13):
```go
package repository

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"time"

	"github.com/finance_app/backend/internal/domain"
	"github.com/finance_app/backend/internal/entity"
	pkgErrors "github.com/finance_app/backend/pkg/errors"
	"gorm.io/gorm"
)
```
For transaction_template_repository.go, drop the cursor-pagination imports (`encoding/base64`, `time` for cursor) — templates are a flat list, not paginated. Keep `context`, `domain`, `entity`, `gorm.io/gorm`; add `errors` (for a sentinel, mirroring charge_repository.go) only if the cap check needs one.

**List-by-user pattern** (created_at ASC per D-decisions; adapt from notification_repository.go lines 57-98, simplified — no cursor):
```go
func (r *transactionTemplateRepository) ListByUserID(ctx context.Context, userID int) ([]*domain.TransactionTemplate, error) {
	var ents []entity.TransactionTemplate
	if err := GetTxFromContext(ctx, r.db).
		Where("user_id = ?", userID).
		Order("created_at ASC").
		Find(&ents).Error; err != nil {
		return nil, err
	}
	result := make([]*domain.TransactionTemplate, len(ents))
	for i := range ents {
		e := ents[i]
		result[i] = e.ToDomain()
	}
	return result, nil
}
```
(Pattern source for the loop-and-`ToDomain()` idiom: `push_subscription_repository.go` lines 83-96, `ListByUserID`.)

**Get-by-id-scoped-to-user pattern** (IDOR: 404 not 403 — SAFE-02; mirrors notification_repository.go `MarkRead`/`Delete` `RowsAffected` idiom, lines 109-121 and 130-141):
```go
func (r *transactionTemplateRepository) GetByIDForUser(ctx context.Context, userID, id int) (*domain.TransactionTemplate, error) {
	var ent entity.TransactionTemplate
	err := GetTxFromContext(ctx, r.db).
		Where("id = ? AND user_id = ?", id, userID).
		First(&ent).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, pkgErrors.NotFound("transaction template")
		}
		return nil, err
	}
	return ent.ToDomain(), nil
}
```
Note: notification_repository.go's `MarkRead`/`Delete` use `Update`/`Delete` + `result.RowsAffected == 0` → `pkgErrors.NotFound(...)` directly in the repository (not `gorm.ErrRecordNotFound`). Follow **that** idiom for `Update`/`Delete` on templates (repository returns `pkgErrors.NotFound` directly), e.g.:
```go
func (r *transactionTemplateRepository) Delete(ctx context.Context, userID, id int) error {
	result := GetTxFromContext(ctx, r.db).
		Where("id = ? AND user_id = ?", id, userID).
		Delete(&entity.TransactionTemplate{})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return pkgErrors.NotFound("transaction template")
	}
	return nil
}
```
Same shape for `Update` (`.Model(&entity.TransactionTemplate{}).Where("id = ? AND user_id = ?", ...).Updates(...)`, check `RowsAffected`). This is the SAFE-02 404-not-403 pattern verbatim.

**Race-safe cap+insert (no exact analog — compose from `charge_repository.ConditionalAccept`):**

`charge_repository.go` lines 12-15 and 93-104 — sentinel error + conditional single-statement write, checked via `RowsAffected`:
```go
// ErrChargeNotPending is returned by ConditionalAccept when the charge was
// not in pending status at the moment of the update. The service layer
// maps this to pkgErrors.AlreadyExists to yield HTTP 409.
var ErrChargeNotPending = errors.New("charge is not pending")
...
func (r *chargeRepository) ConditionalAccept(ctx context.Context, id int) error {
	result := GetTxFromContext(ctx, r.db).Exec(
		"UPDATE charges SET status = ?, updated_at = NOW() WHERE id = ? AND status = ?",
		domain.ChargeStatusPaid, id, domain.ChargeStatusPending,
	)
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return ErrChargeNotPending
	}
	return nil
}
```
And the service-side translation (`charge_accept.go` lines 150-156):
```go
// ---- Race-guarded status UPDATE ----
if err := s.chargeRepo.ConditionalAccept(txCtx, charge.ID); err != nil {
	if errors.Is(err, repository.ErrChargeNotPending) {
		return pkgErrors.AlreadyExists("charge")
	}
	return pkgErrors.Internal("failed to accept charge", err)
}
```
**Apply this exact sentinel+RowsAffected+errors.Is shape to the cap.** Define `var ErrTemplateLimitReached = errors.New("template limit reached")` in the repository, and implement `Create` as a single conditional `INSERT ... SELECT ... WHERE (SELECT COUNT(*) FROM transaction_templates WHERE user_id = ?) < 3` (raw SQL via `.Exec`, same as `ConditionalAccept`'s `.Exec` + `result.RowsAffected`), e.g.:
```go
func (r *transactionTemplateRepository) Create(ctx context.Context, t *domain.TransactionTemplate) (*domain.TransactionTemplate, error) {
	ent := entity.TransactionTemplateFromDomain(t)
	payloadJSON, err := json.Marshal(ent.Payload)
	if err != nil {
		return nil, err
	}
	result := GetTxFromContext(ctx, r.db).Exec(`
		INSERT INTO transaction_templates (user_id, name, payload, created_at, updated_at)
		SELECT ?, ?, ?, NOW(), NOW()
		WHERE (SELECT COUNT(*) FROM transaction_templates WHERE user_id = ?) < 3
	`, ent.UserID, ent.Name, payloadJSON, ent.UserID)
	if result.Error != nil {
		return nil, result.Error
	}
	if result.RowsAffected == 0 {
		return nil, ErrTemplateLimitReached
	}
	// re-select to get the generated ID/timestamps (RETURNING id could also be used with .Raw+.Scan)
	...
}
```
Service maps `errors.Is(err, repository.ErrTemplateLimitReached)` → `pkgErrors.NewWithTag(pkgErrors.ErrCodeBadRequest, []string{string(pkgErrors.ErrorTagTemplateLimitReached)}, "...")`, exactly mirroring the `ErrChargeNotPending` → `AlreadyExists` translation above (planner/executor picks final `INSERT...RETURNING` vs `Exec`+re-`First` — this file gives the shape, not the final SQL).

**Duplicate-name (unique-violation) detection:** no repository-level analog exists for translating a Postgres unique-constraint violation directly (the `category_service.go` precedent does a **pre-check `Search`**, not constraint-catching — see below). If the executor prefers catching the DB error instead, there is no existing idiom in this codebase; the pre-check-inside-tx approach (already used by `category_service.checkSiblingUniqueness`) is the safer default since D-05 explicitly allows either.

---

### `backend/internal/repository/interfaces.go` (modify)

**Analog:** `PushSubscriptionRepository` doc-comment style (lines 106-127) + `NotificationRepository` (lines 129-137) + `Repositories` struct (lines 139-155).

Add, following the existing doc-comment convention (explain IDOR scope, note isolation):
```go
// TransactionTemplateRepository manages per-user transaction templates.
// GetByIDForUser/Update/Delete are scoped by (id, user_id) — SAFE-02:
// a row that doesn't match the caller returns NOT_FOUND (via RowsAffected == 0
// or ErrRecordNotFound), never leaking existence across users.
// Create is race-safe capped at 3 rows per user (SAFE-01) — see ErrTemplateLimitReached.
// This repository is deliberately NOT joined into Search/GetBalance/settlement
// queries (P26 isolation guarantee).
type TransactionTemplateRepository interface {
	ListByUserID(ctx context.Context, userID int) ([]*domain.TransactionTemplate, error)
	Create(ctx context.Context, t *domain.TransactionTemplate) (*domain.TransactionTemplate, error)
	GetByIDForUser(ctx context.Context, userID, id int) (*domain.TransactionTemplate, error)
	Update(ctx context.Context, userID int, t *domain.TransactionTemplate) error
	Delete(ctx context.Context, userID, id int) error
}
```
Then add `TransactionTemplate TransactionTemplateRepository` to the `Repositories` struct (after `Notification`, matching declaration order of `main.go`'s repo init block).

---

### `backend/internal/service/transaction_template_service.go` (new)

**Primary analog:** `backend/internal/service/push_subscription_service.go` (IDOR signature, constructor shape)
**Secondary analog:** `backend/internal/service/category_service.go` (DBTransaction-wrapped write + duplicate-name pre-check)
**Validation analog:** `backend/internal/service/transaction_create.go` (split-settings XOR validation, lines 199-229)

**Imports + constructor pattern** (push_subscription_service.go lines 1-23):
```go
package service

import (
	"context"

	"github.com/finance_app/backend/internal/domain"
	"github.com/finance_app/backend/internal/repository"
	pkgErrors "github.com/finance_app/backend/pkg/errors"
)

type transactionTemplateService struct {
	dbTransaction   repository.DBTransaction
	templateRepo    repository.TransactionTemplateRepository
}

func NewTransactionTemplateService(repos *repository.Repositories) TransactionTemplateService {
	return &transactionTemplateService{
		dbTransaction: repos.DBTransaction,
		templateRepo:  repos.TransactionTemplate,
	}
}
```
(`dbTransaction` field comes from `category_service.go` lines 15-27, needed because Create wraps cap-check/insert in a tx per D-09/CLAUDE.md "Database transactions" convention — even though the single conditional-INSERT statement is already atomic, keep the tx wrapper if a pre-check `Search` for duplicate name is also required in the same write, exactly as `category_service.Create` wraps sibling-uniqueness-check + insert in one tx, lines 29-61.)

**IDOR signature/comment convention** (push_subscription_service.go line 40-42, copy verbatim wording):
```go
// Create registers a new transaction template for the authenticated user.
// SECURITY (IDOR): userID is the function argument from auth context — NEVER read from req.
func (s *transactionTemplateService) Create(ctx context.Context, userID int, req *domain.TransactionTemplatePayload, name string) (*domain.TransactionTemplate, error) {
```
Apply this exact comment + signature convention to **every** method (`List`, `Create`, `Update`, `Delete`) — `userID` is always the second parameter (first after `ctx`), never sourced from the request body/DTO.

**Tx-wrapped write pattern** (category_service.go lines 29-61, `Create`):
```go
func (s *categoryService) Create(ctx context.Context, userID int, category *domain.Category) (*domain.Category, error) {
	ctx, err := s.dbTransaction.Begin(ctx)
	if err != nil {
		return nil, pkgErrors.Internal("failed to begin transaction", err)
	}
	defer s.dbTransaction.Rollback(ctx)

	// ... validation + uniqueness check ...

	created, err := s.categoryRepo.Create(ctx, category)
	if err != nil {
		return nil, pkgErrors.Internal("failed to create category", err)
	}

	if err := s.dbTransaction.Commit(ctx); err != nil {
		return nil, pkgErrors.Internal("failed to commit transaction", err)
	}
	return created, nil
}
```
Reuse this exact Begin/defer-Rollback/Commit skeleton for the template `Create`, substituting the cap-check for the parent/sibling check, and translating `repository.ErrTemplateLimitReached` (via `errors.Is`, see charge_accept.go pattern above) instead of returning a generic internal error.

**Duplicate-name check — IMPORTANT DISCREPANCY TO FLAG FOR THE PLANNER:**
`category_service.checkSiblingUniqueness` (lines 219-249) returns `pkgErrors.NewWithTag(pkgErrors.ErrCodeValidation, ...)` — i.e. **400**, not 409 — despite the tag being named `CATEGORY.DUPLICATE_NAME`. CONTEXT.md D-05 explicitly locks **409 / `ErrCodeAlreadyExists`** for `TEMPLATE.DUPLICATE_NAME`. Do **NOT** copy category's HTTP code; copy its *tag-construction* idiom but use `pkgErrors.ErrCodeAlreadyExists` (see `tag_service.Update`, line 82, `pkgErrors.AlreadyExists("tag with this name")`, which correctly maps to 409 via `serviceErrHTTPCode`). Recommended construction:
```go
return pkgErrors.NewWithTag(
	pkgErrors.ErrCodeAlreadyExists,
	[]string{string(pkgErrors.ErrorTagTemplateDuplicateName)},
	"a template with this name already exists",
)
```

**Split-settings XOR validation** (transaction_create.go lines 211-229 — copy this loop verbatim, adjusted for `errs` collection style or single-first-error style, planner's call per D-04):
```go
if len(transaction.SplitSettings) > 0 {
	for i, splitSetting := range transaction.SplitSettings {
		if splitSetting.Percentage == nil && splitSetting.Amount == nil {
			errs = append(errs, pkgErrors.ErrSplitSettingPercentageOrAmountIsRequired(i))
		}
		if splitSetting.Percentage != nil && splitSetting.Amount != nil {
			errs = append(errs, pkgErrors.ErrSplitSettingPercentageAndAmountCannotBeUsedTogether(i))
		}
		if splitSetting.Percentage != nil && (*splitSetting.Percentage < 1 || *splitSetting.Percentage > 100) {
			errs = append(errs, pkgErrors.ErrSplitSettingPercentageMustBeBetween1And100(i))
		}
	}
}
```
D-03 says reuse the **existing** `ErrSplitSetting*` sentinels/tags (they are already `TRANSACTION.SPLIT_SETTING_*`, not `TEMPLATE.*`) — do not invent new tags for split-row shape errors; only `TEMPLATE.INVALID_SPLIT_ROW` needs to be added if a template-specific wrapper tag is desired (planner's call — the existing `TRANSACTION.SPLIT_SETTING_*` tags may simply be reused as-is since the frontend already knows them).

**`type.IsValid()` check** (domain/transaction.go lines 13-30):
```go
type TransactionType string

const (
	TransactionTypeExpense  TransactionType = "expense"
	TransactionTypeIncome   TransactionType = "income"
	TransactionTypeTransfer TransactionType = "transfer"
)

func (t TransactionType) IsValid() bool {
	return t == TransactionTypeExpense || t == TransactionTypeIncome || t == TransactionTypeTransfer
}
```
Use `payload.Type.IsValid()` directly — no new enum needed (D-03).

**Delete/Update ownership-scoped pattern** (tag_service.go lines 93-110, simplest shape — no tx needed since it's a single-repo op):
```go
func (s *tagService) Delete(ctx context.Context, userID, id int) error {
	existing, err := s.tagRepo.Search(ctx, domain.TagSearchOptions{UserIDs: []int{userID}, IDs: []int{id}})
	if err != nil {
		return pkgErrors.Internal("failed to get tag", err)
	}
	if len(existing) == 0 {
		return pkgErrors.NotFound("tag")
	}
	if err := s.tagRepo.Delete(ctx, id); err != nil {
		return pkgErrors.Internal("failed to delete tag", err)
	}
	return nil
}
```
For templates, the repository's `Delete(ctx, userID, id)` already does the `(id, user_id)` scoping + `RowsAffected` check (see repository section above), so the service method can be a thin passthrough — do NOT duplicate the ownership pre-check in the service (that would be the `tag_service`/older style); prefer the thinner `notification_service`-style passthrough where the repository itself returns `NotFound`.

---

### `backend/internal/service/interfaces.go` (modify)

**Analog:** `PushSubscriptionService` (lines 91-95) + `CategoryService` (lines 42-49) + `Services` struct (lines 113-127).

```go
type TransactionTemplateService interface {
	List(ctx context.Context, userID int) ([]*domain.TransactionTemplate, error)
	Create(ctx context.Context, userID int, name string, payload domain.TransactionTemplatePayload) (*domain.TransactionTemplate, error)
	Update(ctx context.Context, userID, id int, name string, payload domain.TransactionTemplatePayload) error
	Delete(ctx context.Context, userID, id int) error
}
```
Add `TransactionTemplate TransactionTemplateService` to the `Services` struct (after `Notification`).

---

### `backend/internal/handler/transaction_template_handler.go` (new)

**Analog:** `backend/internal/handler/notification_handler.go` (most recent — uses `HandleServiceError`, preserves error `Tags` end-to-end; **prefer this over** `tag_handler.go`, which predates `HandleServiceError` and uses raw `echo.NewHTTPError(http.StatusBadRequest, err.Error())`, silently dropping the `Tags` the frontend needs to render `TEMPLATE.*` messages).

**Imports + constructor pattern** (notification_handler.go lines 1-21):
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

type TransactionTemplateHandler struct {
	templateService service.TransactionTemplateService
}

func NewTransactionTemplateHandler(services *service.Services) *TransactionTemplateHandler {
	return &TransactionTemplateHandler{
		templateService: services.TransactionTemplate,
	}
}
```

**List handler pattern** (notification_handler.go `List`, lines 23-53, simplified — no cursor/limit):
```go
// List godoc
// @Summary      List transaction templates
// @Description  Returns the authenticated user's saved transaction templates, oldest first (max 3)
// @Tags         transaction-templates
// @Produce      json
// @Security     CookieAuth
// @Security     BearerAuth
// @Success      200  {array}   domain.TransactionTemplate
// @Failure      401  {object}  middleware.ErrorResponse
// @Router       /api/transaction-templates [get]
func (h *TransactionTemplateHandler) List(c echo.Context) error {
	userID := appcontext.GetUserIDFromContext(c.Request().Context())
	templates, err := h.templateService.List(c.Request().Context(), userID)
	if err != nil {
		return HandleServiceError(err)
	}
	return c.JSON(http.StatusOK, templates)
}
```

**Create/Update/Delete pattern** (notification_handler.go `MarkRead`/`Delete`, lines 101-111 and 140-150 — `strconv.Atoi` + `HandleServiceError`):
```go
func (h *TransactionTemplateHandler) Delete(c echo.Context) error {
	userID := appcontext.GetUserIDFromContext(c.Request().Context())
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid template id")
	}
	if err := h.templateService.Delete(c.Request().Context(), userID, id); err != nil {
		return HandleServiceError(err)
	}
	return c.NoContent(http.StatusNoContent)
}
```
`Create`/`Update` follow the `c.Bind(&req)` + `echo.NewHTTPError(http.StatusBadRequest, "invalid request body")` on bind failure idiom (push_subscription_handler.go lines 39-42), then call the service and `HandleServiceError` on failure. Success codes per CONTEXT discretion: 201 (Create), 200 or 204 (Update — pick 200 with body to match `account_handler`-style updates, or 204 like `tag_handler`/`category_handler`; `HandleServiceError` is orthogonal to this choice).

**Swagger annotation style** (push_subscription_handler.go lines 24-35 and notification_handler.go throughout) — always include `@Security CookieAuth` + `@Security BearerAuth`, `@Tags transaction-templates`, `@Failure 401 {object} middleware.ErrorResponse`, and add `@Failure 404` for Update/Delete (owner-mismatch → 404 per SAFE-02) and `@Failure 409` for Create (duplicate-name / cap).

---

### `backend/pkg/errors/errors.go` (modify)

**Analog:** existing `CATEGORY.*` / `IMPORT.*` const+var blocks (lines 70-71, 73-77, and 373-379).

Add a new `ErrorTag` const block (after the `NOTIFICATION.*` block, line 82-84):
```go
ErrorTagTemplateLimitReached  ErrorTag = "TEMPLATE.LIMIT_REACHED"
ErrorTagTemplateDuplicateName ErrorTag = "TEMPLATE.DUPLICATE_NAME"
ErrorTagTemplateNameRequired  ErrorTag = "TEMPLATE.NAME_REQUIRED"
ErrorTagTemplateInvalidType   ErrorTag = "TEMPLATE.INVALID_TYPE"
```
And sentinel vars (mirroring `ErrImportEmptyFile`/`ErrDuplicateCategoryName`-style, lines 372-380), noting **`ErrCodeAlreadyExists`** (409) for duplicate-name and cap per D-05/D-09 (NOT `ErrCodeValidation` like the category precedent's actual code — see the discrepancy flagged in the service section above):
```go
var (
	ErrTemplateLimitReached  = NewWithTag(ErrCodeAlreadyExists, []string{string(ErrorTagTemplateLimitReached)}, "you can only have up to 3 templates")
	ErrTemplateDuplicateName = NewWithTag(ErrCodeAlreadyExists, []string{string(ErrorTagTemplateDuplicateName)}, "a template with this name already exists")
	ErrTemplateNameRequired  = NewWithTag(ErrCodeBadRequest, []string{string(ErrorTagTemplateNameRequired)}, "name is required")
	ErrTemplateInvalidType   = NewWithTag(ErrCodeBadRequest, []string{string(ErrorTagTemplateInvalidType)}, "invalid transaction type")
)
```
(Follow the "1. add ErrorTagXxx const, 2. declare sentinel ErrXxx" two-step from `backend/CLAUDE.md` "Error Handling" section verbatim.)

---

### `cmd/server/main.go` (modify)

**Analog:** the `PushSubscription`/`Notification` wiring blocks (repo init lines 79-94, service init lines 96-111, handler init lines 113-123, route registration lines 271-287).

1. Repository init (add to `repos := &repository.Repositories{...}` block, after `Notification:`):
```go
TransactionTemplate: repository.NewTransactionTemplateRepository(db),
```
2. Service init (simple map, no cross-service dep — same style as `Category`/`Tag` at lines 100-104, not the two-phase `services.X = ...` style used by `Transaction`/`Charge` which need `services` itself):
```go
services := &service.Services{
	...
	TransactionTemplate: service.NewTransactionTemplateService(repos),
}
```
3. Handler init (line ~113-123 block):
```go
templateHandler := handler.NewTransactionTemplateHandler(services)
```
4. Add `template *handler.TransactionTemplateHandler` to the `apiHandlers` struct (lines 204-215) and pass `template: templateHandler` at the call site (lines 162-173).
5. Route registration inside `registerAPIRoutes` (mirror the `tags`/`categories` block, lines 241-252 — flat resource, no nested sub-routes):
```go
// Transaction templates
templates := api.Group("/transaction-templates")
templates.GET("", h.template.List)
templates.POST("", h.template.Create)
templates.PUT("/:id", h.template.Update)
templates.DELETE("/:id", h.template.Delete)
```

---

### DTOs (request/response)

Two valid precedents exist in this codebase — planner picks per CONTEXT discretion:

**Option A — direct domain-struct bind** (`tag_handler.go` lines 38, 94 — `var tag domain.Tag; c.Bind(&tag)`): bind straight into `domain.TransactionTemplate` (or a lightweight subset), simplest, matches `tag`/`category` handlers.

**Option B — dedicated request DTO in the domain package** (`domain/push_subscription.go` lines 14-17, `SubscribePushRequest`): add e.g.
```go
type TransactionTemplateCreateRequest struct {
	Name    string                     `json:"name"`
	Payload TransactionTemplatePayload `json:"payload"`
}
```
to `backend/internal/domain/transaction_template.go` (the existing P26 file — modify, don't create a new file; this matches how `push_subscription.go` and `category.go`/`DeleteCategoryRequest` co-locate request/response DTOs next to their domain model in the same file). **This option is recommended** since D-01/D-02 require a distinct lenient-unmarshal step separate from the strict `TransactionTemplatePayload` struct that's persisted — a dedicated `*Request` DTO makes that boundary explicit, consistent with `TransactionCreateRequest`/`TransactionUpdateRequest` in `domain/transaction.go`.

### mocks (`just generate-mocks`)

No manual pattern — after adding `TransactionTemplateRepository` and `TransactionTemplateService` to their respective `interfaces.go` files, run `just generate-mocks` from `backend/`. Mocks land under `backend/mocks/` with `DO NOT EDIT` headers (per `backend/CLAUDE.md` "Testing" section) — never hand-write them.

### Swagger (`just generate-docs`)

No manual pattern beyond the annotation style shown in the handler section above — run `just generate-docs` from `backend/` after the handler's godoc comments are in place; this regenerates `backend/docs/`.

## Shared Patterns

### IDOR (userID from context, never request body)
**Source:** `backend/internal/service/push_subscription_service.go` lines 40-42
**Apply to:** every `TransactionTemplateService` method
```go
// SECURITY (IDOR): userID is the function argument from auth context — NEVER read from req.
```

### 404-not-403 ownership scoping (SAFE-02)
**Source:** `backend/internal/repository/notification_repository.go` lines 109-141 (`MarkRead`, `Delete` — `Where("id = ? AND user_id = ?", ...)` + `RowsAffected == 0` → `pkgErrors.NotFound(...)`)
**Apply to:** `transaction_template_repository.go` `GetByIDForUser`/`Update`/`Delete`

### Race-safe conditional write via sentinel error
**Source:** `backend/internal/repository/charge_repository.go` lines 12-15, 93-104 (`ErrChargeNotPending` + `ConditionalAccept`) and `backend/internal/service/charge_accept.go` lines 150-156 (`errors.Is` translation)
**Apply to:** `transaction_template_repository.go` `Create` (cap) + `transaction_template_service.go` `Create` (translate `ErrTemplateLimitReached` → `TEMPLATE.LIMIT_REACHED`)

### Error tag construction (`DOMAIN.WHAT_HAPPENED`)
**Source:** `backend/pkg/errors/errors.go` lines 70-84, 372-380; two-step recipe in `backend/CLAUDE.md` "Error Handling"
**Apply to:** all four new `TEMPLATE.*` tags

### Handler → HTTP error translation (tag-preserving)
**Source:** `backend/internal/handler/errors.go` (`HandleServiceError`), used throughout `notification_handler.go` and `push_subscription_handler.go`
**Apply to:** `transaction_template_handler.go` — do NOT use the older `echo.NewHTTPError(http.StatusBadRequest, err.Error())` idiom from `tag_handler.go`/`category_handler.go`, which loses `Tags`.

### DBTransaction for multi-step writes
**Source:** `backend/internal/repository/db_transaction.go` + `backend/internal/service/category_service.go` lines 29-61 (Begin/defer Rollback/Commit skeleton)
**Apply to:** `transaction_template_service.Create` if a duplicate-name pre-check `Search` runs in the same write as the capped insert (must stay in one tx per D-05 discretion note).

## No Analog Found

| File/Concern | Role | Data Flow | Reason |
|---|---|---|---|
| Single-statement race-safe **cap+insert** (`INSERT ... SELECT ... WHERE (SELECT COUNT(*) ...) < 3`) | repository | CRUD | No existing repository performs a conditional INSERT gated by a COUNT subquery. Closest precedent (`charge_repository.ConditionalAccept`) is a conditional **UPDATE** gated by a status equality check, not a COUNT threshold — same `Exec` + `RowsAffected` + sentinel-error shape, but the SQL predicate must be composed fresh. See the "Race-safe cap+insert" excerpt above for the recommended composition. |

## Metadata

**Analog search scope:** `backend/internal/repository/`, `backend/internal/service/`, `backend/internal/handler/`, `backend/internal/domain/`, `backend/internal/entity/`, `backend/pkg/errors/`, `backend/cmd/server/main.go`
**Files scanned:** ~20 (repository, service, handler triads for push-subscription, notification, tag, category, charge; plus interfaces.go x2, errors.go, db_transaction.go, main.go, entity/domain transaction_template.go, transaction_create.go, transaction.go)
**Pattern extraction date:** 2026-07-07
