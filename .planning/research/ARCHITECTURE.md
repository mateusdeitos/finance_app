# Architecture Research: Transaction Templates (v1.7)

**Domain:** Personal transaction templates for a couples' finance app
**Researched:** 2026-06-07
**Confidence:** HIGH — based on direct codebase inspection across all layers

---

## System Overview

```
Backend (Go/Echo/GORM/PostgreSQL)           Frontend (React 19/RHF/TanStack)
─────────────────────────────────           ─────────────────────────────────
HTTP Handler (Echo)                         TransactionForm
   ↕                                           ↕ (reset() on chip click)
TemplateService (business logic)            TemplateQuickChips (new, above form)
   ↕                                           ↕
TemplateRepository (CRUD + IDOR cap)        TemplatesManagementDrawer (new)
   ↕                                           ↕
PostgreSQL: transaction_templates table     TanStack Query hooks (new)
  + template_tags join table                   ↕
                                            src/api/templates.ts (new)
```

---

## Backend Architecture

### 1. Migration

**File (new):** `backend/migrations/<timestamp>_create_transaction_templates_table.sql`

Create with `just migrate-create create_transaction_templates_table`.

```sql
-- +goose Up
CREATE TABLE transaction_templates (
    id          SERIAL PRIMARY KEY,
    user_id     INT         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name        TEXT        NOT NULL,
    type        TEXT        NOT NULL CHECK (type IN ('expense', 'income', 'transfer')),
    account_id  INT         REFERENCES accounts(id) ON DELETE SET NULL,
    category_id INT         REFERENCES categories(id) ON DELETE SET NULL,
    description TEXT        NOT NULL DEFAULT '',
    split_settings JSONB    NOT NULL DEFAULT '[]',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_transaction_templates_user_id ON transaction_templates(user_id);

CREATE TABLE template_tags (
    template_id INT NOT NULL REFERENCES transaction_templates(id) ON DELETE CASCADE,
    tag_id      INT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (template_id, tag_id)
);

-- +goose Down
DROP TABLE IF EXISTS template_tags;
DROP TABLE IF EXISTS transaction_templates;
```

**Rationale for each column:**
- `name`: user-chosen label for the chip (e.g. "Netflix", "Feira"). Distinct from `description` which pre-fills the transaction's description field.
- `type`: mirrors `transactions.type`; stored as TEXT with a CHECK (no separate enum type to keep migration simpler, following settlement pattern).
- `account_id` / `category_id`: nullable FKs with SET NULL on delete — a deleted account/category becomes null on the template rather than cascading template deletion. The service surfaces this as a warning to the user.
- `description`: pre-fills the transaction form's description field; empty string is valid.
- `split_settings`: JSONB array; see split modeling section below. Default `'[]'` means no split.
- No `amount`, no `date` columns — intentional per spec.
- No `destination_account_id` — templates for transfers are out of scope for v1.7 (only expense/income make sense without a fixed amount, and the split semantics on transfers differ). If type=transfer is stored, destination is null; the form handles it gracefully since the validation only fires on submit.

**Tags: separate join table, not JSONB.**

Tags are a first-class entity with their own `tags` table and `tag_id` FK. Storing tag IDs in JSONB would break referential integrity and make tag deletion cascade impossible. The `template_tags` join table mirrors the `transaction_tags` pattern used by the `entity.Transaction` GORM model (`gorm:"many2many:transaction_tags;..."`). GORM's `Association("Tags").Replace(tags)` pattern used in `transactionRepository.Update` applies identically here.

### 2. Domain Type

**File (new):** `backend/internal/domain/transaction_template.go`

```go
package domain

import "time"

type TransactionTemplate struct {
    ID            int             `json:"id"`
    UserID        int             `json:"user_id"`
    Name          string          `json:"name"`
    Type          TransactionType `json:"type"`
    AccountID     *int            `json:"account_id,omitempty"`
    CategoryID    *int            `json:"category_id,omitempty"`
    Description   string          `json:"description"`
    SplitSettings []SplitSettings `json:"split_settings,omitempty"`
    Tags          []Tag           `json:"tags,omitempty"`
    CreatedAt     *time.Time      `json:"created_at"`
    UpdatedAt     *time.Time      `json:"updated_at"`
}

type TransactionTemplateCreateRequest struct {
    Name          string          `json:"name"`
    Type          TransactionType `json:"transaction_type"`
    AccountID     *int            `json:"account_id,omitempty"`
    CategoryID    *int            `json:"category_id,omitempty"`
    Description   string          `json:"description"`
    SplitSettings []SplitSettings `json:"split_settings,omitempty"`
    Tags          []Tag           `json:"tags,omitempty"`
}

type TransactionTemplateUpdateRequest struct {
    Name          *string          `json:"name,omitempty"`
    Type          *TransactionType `json:"transaction_type,omitempty"`
    AccountID     *int             `json:"account_id,omitempty"`
    CategoryID    *int             `json:"category_id,omitempty"`
    Description   *string          `json:"description,omitempty"`
    SplitSettings []SplitSettings  `json:"split_settings,omitempty"`
    Tags          []Tag            `json:"tags,omitempty"`
}

type TransactionTemplateFilter struct {
    IDs    []int `query:"id[]"`
    UserID int   `query:"user_id"`
}
```

**Reuse of `domain.SplitSettings`:** The existing `SplitSettings` struct (`internal/domain/transaction.go`) has `ConnectionID int`, `Percentage *int`, `Amount *int64`, and `Date *Date`. Only `ConnectionID` and `Percentage` are meaningful for a template (amount-less context); Amount and Date are ignored when applying a template. The struct is reused as-is — no new type needed. The service strips the `Amount` and `Date` fields when reading from JSONB for safety.

**`domain.SplitSettings.UserConnection` field:** This is a non-serialized pointer (`UserConnection *UserConnection` with no `json` tag shown in source). It is safe to serialize/deserialize the struct to JSONB because GORM's JSON column scanning uses the json tags; the in-memory pointer is not persisted.

### 3. Entity

**File (new):** `backend/internal/entity/transaction_template.go`

```go
package entity

import (
    "encoding/json"
    "time"

    "github.com/finance_app/backend/internal/domain"
    "github.com/samber/lo"
)

type TransactionTemplate struct {
    ID            int                     `gorm:"primaryKey;autoIncrement"`
    UserID        int                     `gorm:"not null"`
    Name          string                  `gorm:"not null"`
    Type          domain.TransactionType  `gorm:"not null"`
    AccountID     *int
    CategoryID    *int
    Description   string
    SplitSettings []byte                  `gorm:"type:jsonb;not null;default:'[]'"`
    Tags          []Tag                   `gorm:"many2many:template_tags;joinForeignKey:template_id;joinReferences:tag_id"`
    CreatedAt     *time.Time
    UpdatedAt     *time.Time
}

func (t *TransactionTemplate) ToDomain() *domain.TransactionTemplate {
    var splitSettings []domain.SplitSettings
    if len(t.SplitSettings) > 0 {
        _ = json.Unmarshal(t.SplitSettings, &splitSettings)
    }
    return &domain.TransactionTemplate{
        ID:          t.ID,
        UserID:      t.UserID,
        Name:        t.Name,
        Type:        t.Type,
        AccountID:   t.AccountID,
        CategoryID:  t.CategoryID,
        Description: t.Description,
        SplitSettings: splitSettings,
        Tags: lo.Map(t.Tags, func(tag Tag, _ int) domain.Tag {
            return *tag.ToDomain()
        }),
        CreatedAt: t.CreatedAt,
        UpdatedAt: t.UpdatedAt,
    }
}

func TransactionTemplateFromDomain(d *domain.TransactionTemplate) *TransactionTemplate {
    splitBytes, _ := json.Marshal(d.SplitSettings)
    return &TransactionTemplate{
        ID:          d.ID,
        UserID:      d.UserID,
        Name:        d.Name,
        Type:        d.Type,
        AccountID:   d.AccountID,
        CategoryID:  d.CategoryID,
        Description: d.Description,
        SplitSettings: splitBytes,
        Tags: lo.Map(d.Tags, func(tag domain.Tag, _ int) Tag {
            return *TagFromDomain(&tag)
        }),
        CreatedAt: d.CreatedAt,
        UpdatedAt: d.UpdatedAt,
    }
}
```

**JSONB encoding:** `[]byte` with `gorm:"type:jsonb"` is the standard GORM pattern for JSONB columns. `json.Marshal`/`json.Unmarshal` on `[]domain.SplitSettings` works because `SplitSettings` fields are all json-tagged. The `UserConnection *UserConnection` pointer inside `SplitSettings` has no json tag and will serialize to `null`/be ignored — safe.

**Tags many2many:** Uses GORM `many2many` with explicit join table `template_tags`, `joinForeignKey:template_id`, `joinReferences:tag_id`. This mirrors the `transaction_tags` pattern in `entity.Transaction` exactly. `Association("Tags").Replace(tags)` can be called in the repository update method identically.

### 4. Repository

**File (new):** `backend/internal/repository/template_repository.go`

**Interface added to** `backend/internal/repository/interfaces.go`:

```go
type TransactionTemplateRepository interface {
    Create(ctx context.Context, template *domain.TransactionTemplate) (*domain.TransactionTemplate, error)
    Update(ctx context.Context, template *domain.TransactionTemplate) error
    Delete(ctx context.Context, userID, id int) error
    Search(ctx context.Context, filter domain.TransactionTemplateFilter) ([]*domain.TransactionTemplate, error)
    CountByUserID(ctx context.Context, userID int) (int64, error)
}
```

The `Repositories` struct in `interfaces.go` gains field `TransactionTemplate TransactionTemplateRepository`.

**Implementation notes:**

- `Create`: `db.Create(ent)` then `db.Model(ent).Association("Tags").Replace(tags)` — same pattern as `transactionRepository.Update`. No DB transaction needed (single template + tags; association replace is atomic enough for this use).
- `Update`: `db.Save(ent)` then `Association("Tags").Replace(tags)` — same pattern.
- `Delete`: Scoped by `userID` AND `id` for IDOR: `db.Where("id = ? AND user_id = ?", id, userID).Delete(&entity.TransactionTemplate{})`. Cascade from `template_tags` handles tag join rows automatically.
- `Search`: `db.Where("user_id = ?", filter.UserID).Preload("Tags").Find(&templates)`. Preload Tags so the domain object is fully populated.
- `CountByUserID`: `db.Model(&entity.TransactionTemplate{}).Where("user_id = ?", userID).Count(&count)`. Used by service to enforce the 3-template cap.

**IDOR note:** `Delete` is scoped at the repository level (user_id + id). `Search` always takes a `UserID` in the filter, which the service populates from the authenticated caller — never from the request body. `Update` similarly: the service loads the template first (verifying ownership via `Search`), then calls `repo.Update`.

### 5. Service

**File (new):** `backend/internal/service/template_service.go`

**Interface added to** `backend/internal/service/interfaces.go`:

```go
type TransactionTemplateService interface {
    Create(ctx context.Context, userID int, req *domain.TransactionTemplateCreateRequest) (*domain.TransactionTemplate, error)
    Update(ctx context.Context, userID, id int, req *domain.TransactionTemplateUpdateRequest) (*domain.TransactionTemplate, error)
    Delete(ctx context.Context, userID, id int) error
    List(ctx context.Context, userID int) ([]*domain.TransactionTemplate, error)
}
```

The `Services` struct gains field `TransactionTemplate TransactionTemplateService`.

**Method responsibilities:**

**Create:**
1. Count existing templates for `userID` via `repo.CountByUserID`.
2. If count >= 3, return `pkgErrors.Validation("max 3 templates per user")` with tag `TEMPLATE.LIMIT_REACHED`.
3. Validate `Name` non-empty, `Type` is valid.
4. Set `UserID` from authenticated caller (never from request).
5. Call `repo.Create`.

**Update:**
1. Load template via `repo.Search({UserID: userID, IDs: [id]})`. If empty, return `pkgErrors.NotFound("template")`.
2. Apply partial update fields from request onto the loaded domain object.
3. Call `repo.Update`.

**Delete:**
1. Call `repo.Delete(ctx, userID, id)` (repo is IDOR-scoped).
2. Check rows affected: if 0, return `pkgErrors.NotFound("template")`.

**List:**
1. Call `repo.Search({UserID: userID})`. Return all (max 3).

**No DBTransaction needed:** All template operations are single-resource writes (create/update/delete one row + its tag associations). No multi-repo atomicity required.

**Error tags to add to** `pkg/errors/errors.go`:
```go
ErrorTagTemplateLimitReached ErrorTag = "TEMPLATE.LIMIT_REACHED"
ErrorTagTemplateNotFound     ErrorTag = "TEMPLATE.NOT_FOUND"
ErrorTagTemplateNameRequired ErrorTag = "TEMPLATE.NAME_REQUIRED"
ErrorTagTemplateInvalidType  ErrorTag = "TEMPLATE.INVALID_TYPE"
```

### 6. Handler + Routes

**File (new):** `backend/internal/handler/template_handler.go`

```go
type TemplateHandler struct {
    templateService service.TransactionTemplateService
}

func NewTemplateHandler(services *service.Services) *TemplateHandler {
    return &TemplateHandler{templateService: services.TransactionTemplate}
}
```

**Routes registered in** `cmd/server/main.go` under `registerAPIRoutes`:

```
GET    /api/transaction-templates          → List
POST   /api/transaction-templates          → Create
PUT    /api/transaction-templates/:id      → Update
DELETE /api/transaction-templates/:id      → Delete
```

**Handler method pattern** (follows `ChargeHandler` / `TagHandler` exactly):
1. Extract `userID` from context.
2. Bind request DTO.
3. Call service with authenticated `userID`.
4. On error: `pkgErrors.ToHTTPError(err)`.
5. On success: `c.JSON(status, result)` or `c.NoContent(204)`.

**IDOR:** Handler never reads `user_id` from the request body. The service always uses the authenticated userID from context.

**Swagger annotations:** Minimum set per `backend/CLAUDE.md`:
- `@Tags transaction-templates`
- `@Security CookieAuth` and `@Security BearerAuth`
- `@Success` / `@Failure` with `middleware.ErrorResponse` for errors

Run `just generate-docs` after adding annotations.

### 7. Wiring in `cmd/server/main.go`

**Modified:** `backend/cmd/server/main.go`

In `repos` construction:
```go
TransactionTemplate: repository.NewTransactionTemplateRepository(db),
```

In `services` construction (no cross-service deps, so can be wired with the simple services):
```go
services.TransactionTemplate = service.NewTransactionTemplateService(repos)
```

In `apiHandlers` struct: add `template *handler.TemplateHandler`.

In `registerAPIRoutes`: add `templates := api.Group("/transaction-templates")` with four routes.

### 8. Mocks

Run `just generate-mocks` after adding `TransactionTemplateRepository` and `TransactionTemplateService` interfaces. This produces:
- `backend/mocks/mock_TransactionTemplateRepository.go` (new)
- `backend/mocks/mock_TransactionTemplateService.go` (new)

---

## Frontend Architecture

### Form Integration: `TemplateQuickChips`

**File (new):** `frontend/src/components/transactions/form/TemplateQuickChips.tsx`

**Mount point in `TransactionForm.tsx`:** Insert the chip row immediately before the `<Controller name="transaction_type" ...>` block — the very first visible element inside `<Stack gap="md">` (after `{headerContent}` and the error `<Alert>`). This matches the DateQuickChips placement pattern: chips appear above the field they inform.

```tsx
// Inside TransactionForm, at the top of <Stack gap="md">:
{headerContent}
{generalError && <Alert ...>{generalError}</Alert>}
<TemplateQuickChips />   {/* NEW — reads templates, calls reset() */}
<Controller name="transaction_type" ...>
```

**Component design** (mirrors `DateQuickChips` pattern):

```tsx
// TemplateQuickChips.tsx
import { Group, UnstyledButton } from "@mantine/core";
import { useFormContext } from "react-hook-form";
import { useTemplates } from "@/hooks/useTemplates";
import { TransactionFormValues } from "./transactionFormSchema";
import { localDateStr } from "@/utils/parseDate";

export function TemplateQuickChips() {
  const { reset, setFocus } = useFormContext<TransactionFormValues>();
  const { query } = useTemplates();
  const templates = query.data ?? [];

  if (templates.length === 0) return null;

  function applyTemplate(tpl: Templates.TransactionTemplate) {
    reset({
      transaction_type: tpl.transaction_type,
      account_id: tpl.account_id ?? undefined,
      category_id: tpl.category_id ?? null,
      description: tpl.description,
      tags: tpl.tags?.map((t) => t.name) ?? [],
      split_settings: tpl.split_settings ?? [],
      date: localDateStr(new Date()),  // today — never from template
      amount: 0,                       // always blank
      destination_account_id: null,
      recurrenceEnabled: false,
      recurrenceType: "monthly",
      recurrenceCurrentInstallment: null,
      recurrenceTotalInstallments: null,
    });
    // Focus amount after reset so user types the amount immediately.
    // Must be called after reset() completes; a microtask delay is reliable.
    setTimeout(() => setFocus("amount"), 0);
  }

  return (
    <Group gap={6} wrap="wrap">
      {templates.map((tpl) => (
        <UnstyledButton
          key={tpl.id}
          type="button"
          onClick={() => applyTemplate(tpl)}
          className={classes.chip}
          data-testid={TemplatesTestIds.TemplateChip(tpl.id)}
        >
          {tpl.name}
        </UnstyledButton>
      ))}
    </Group>
  );
}
```

**Why `reset()` and not `setValue()` per field:** `reset()` replaces the entire form state in one operation, clearing dirty state flags and validation errors simultaneously. `setValue` per field would leave dirty flags set and could leave stale validation errors on fields not in the template. `reset()` is the correct RHF pattern for "load a preset" flows — confirmed by the existing `useResetFormOnChange` hook in `src/hooks/` which uses the same approach.

**Amount blank + focus:** `amount: 0` in the reset payload. After `reset()`, call `setFocus("amount")` via `setTimeout(..., 0)` to let the DOM settle after RHF's state update. The `CurrencyInput` component clears its display value when its controlled value is 0 (verify against `CurrencyInput.tsx`). The `useFocusFieldOnMount` hook used by `TransactionForm` sets focus on `focusField` prop at mount — for subsequent chip clicks (not mount), `setFocus` called from the chip handler is the correct mechanism.

**`useFormContext` availability:** `TemplateQuickChips` is rendered inside `TransactionForm`, which is always wrapped in `<FormProvider {...methods}>` by its parent (e.g. `CreateTransactionDrawer`). `useFormContext` is safe here. No prop-drilling needed.

**CSS module:** `TemplateQuickChips.module.css` — can reuse the same `.chip` styles as `DateQuickChips.module.css` or import that file directly.

### Zod Schema: no changes needed

The template apply sets `amount: 0` and `date: localDateStr(new Date())`. The existing `transactionFormSchema` validates `amount: z.number().int().min(1, ...)` and `date: z.string().min(1, ...)`. Both are satisfied: `amount 0` will fail validation only on submit (correct — user must type an amount), and date is today. No schema changes.

**The "blank amount" UX:** `amount: 0` renders as an empty-looking field in `CurrencyInput` (the component formats cents, so 0 shows as "0,00" or blank depending on implementation). The autofocus brings the user directly to this field. If `CurrencyInput` doesn't clear on focus, the user can type to replace — minor UX, not a blocker.

### "Save as Template" Action

**File (new):** `frontend/src/hooks/useCreateTemplate.ts` (mutation hook)

**Called from:** `CreateTransactionDrawer` via an additional action button in `TransactionForm`'s `extraContent` prop, or as a menu item in `TransactionFormFooter`. The cleanest injection point is the `extraContent` prop that `TransactionForm` already accepts — it renders between the form fields and the sticky footer. The caller reads current form state via `methods.getValues()`.

```tsx
// Inside CreateTransactionDrawer, passed as extraContent:
<SaveAsTemplateButton
  getValues={methods.getValues}
  existingTags={existingTags}
/>
```

```tsx
// SaveAsTemplateButton.tsx (new, small)
function SaveAsTemplateButton({ getValues, existingTags }) {
  const { mutation } = useCreateTemplate();
  function handleSave() {
    const values = getValues();
    // Build template payload from form values (no amount/date/recurrence)
    mutation.mutate({
      name: values.description || "Template",
      transaction_type: values.transaction_type,
      account_id: values.account_id ?? undefined,
      category_id: values.category_id ?? undefined,
      description: values.description,
      split_settings: values.split_settings,
      tags: resolveTagPayload(values.tags, existingTags),
    });
  }
  return (
    <Button
      variant="subtle"
      size="xs"
      onClick={handleSave}
      loading={mutation.isPending}
      data-testid={TemplatesTestIds.BtnSaveAsTemplate}
    >
      Salvar como template
    </Button>
  );
}
```

`getValues()` (not `watch()` or `useWatch`) is correct here — it's a one-shot read at button click time, not a subscription. RHF's `getValues()` returns the current form state without causing re-renders.

### Template Management Drawer

**Files (new):**
- `frontend/src/components/transactions/TemplatesManagementDrawer.tsx`
- `frontend/src/components/transactions/TemplateForm.tsx` (create/edit form inside the drawer)

**Opening pattern:** `renderDrawer(() => <TemplatesManagementDrawer />)` — follows the existing drawer convention exactly. No `useDisclosure`, no lifted state.

**Drawer content:**
- List of up to 3 templates (name, type badge, account name, category name)
- "Novo template" button → inline form or nested drawer
- Per-template Edit / Delete actions
- Cap enforcement: "Novo template" is disabled when `templates.length >= 3` with a tooltip

**Template form schema (new Zod schema):**

```ts
// src/components/transactions/form/templateFormSchema.ts (new)
export const templateFormSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  transaction_type: z.enum(["expense", "income", "transfer"]),
  account_id: z.number().int().nullable(),
  category_id: z.number().int().nullable(),
  description: z.string(),
  split_settings: z.array(splitSettingSchema),  // reuse from transactionFormSchema
  tags: z.array(z.string()),
});
export type TemplateFormValues = z.infer<typeof templateFormSchema>;
```

Note: no `amount`, no `date`, no `recurrenceEnabled`. The template form is a strict subset of the transaction form fields.

**Route (optional):** Templates management can be accessed via a button in the transactions page header (next to "Nova transação") that calls `renderDrawer`. No new TanStack Router route is strictly required — a drawer is sufficient. If a dedicated route is desired, it would be `frontend/src/routes/_authenticated.transaction-templates.tsx` pointing to a `TransactionTemplatesPage`.

### TanStack Query Hooks

**File (new):** `frontend/src/hooks/useTemplates.ts`

```ts
export function useTemplates<T = Templates.TransactionTemplate[]>(
  select?: (data: Templates.TransactionTemplate[]) => T
) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: [QueryKeys.TransactionTemplates],
    queryFn: fetchTemplates,
    select,
  });
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: [QueryKeys.TransactionTemplates] });
  return { query, invalidate };
}
```

**File (new):** `frontend/src/hooks/useCreateTemplate.ts`
**File (new):** `frontend/src/hooks/useUpdateTemplate.ts`
**File (new):** `frontend/src/hooks/useDeleteTemplate.ts`

All follow the existing mutation hook pattern: `useMutation({ mutationFn: ... })`, return `{ mutation }`. Invalidation is caller's responsibility.

**QueryKeys addition:** `TransactionTemplates: 'transaction-templates'` added to `src/utils/queryKeys.ts`.

### API Client

**File (new):** `frontend/src/api/templates.ts`

```ts
export async function fetchTemplates(): Promise<Templates.TransactionTemplate[]>
export async function createTemplate(payload: Templates.CreateTemplatePayload): Promise<Templates.TransactionTemplate>
export async function updateTemplate(id: number, payload: Templates.UpdateTemplatePayload): Promise<Templates.TransactionTemplate>
export async function deleteTemplate(id: number): Promise<void>
```

Mirrors `src/api/tags.ts` pattern: raw `fetch` calls with `credentials: 'include'`, throw on `!res.ok`.

### TypeScript Types

**File (new or added to existing):** `frontend/src/types/templates.ts` (new namespace `Templates`)

```ts
export namespace Templates {
  export interface TransactionTemplate {
    id: number;
    user_id: number;
    name: string;
    transaction_type: Transactions.TransactionType;
    account_id?: number;
    category_id?: number;
    description: string;
    split_settings?: Transactions.SplitSetting[];
    tags?: Transactions.Tag[];
    created_at?: string;
    updated_at?: string;
  }

  export interface CreateTemplatePayload {
    name: string;
    transaction_type: Transactions.TransactionType;
    account_id?: number;
    category_id?: number;
    description: string;
    split_settings?: Transactions.SplitSetting[];
    tags?: Array<{ id?: number; name: string }>;
  }

  export type UpdateTemplatePayload = Partial<CreateTemplatePayload>;
}
```

`Transactions.SplitSetting` is reused from `src/types/transactions.ts` (already defined there).

### Test IDs

**File (new):** `frontend/src/testIds/templates.ts`

```ts
export const TemplatesTestIds = {
  DrawerManage: 'drawer_manage_templates',
  BtnOpenManage: 'btn_open_templates',
  BtnNewTemplate: 'btn_new_template',
  BtnSaveAsTemplate: 'btn_save_as_template',
  TemplateChip: (id: number | string) => `chip_template_${id}` as const,
  TemplateRow: (id: number | string) => `row_template_${id}` as const,
  BtnEditTemplate: (id: number | string) => `btn_edit_template_${id}` as const,
  BtnDeleteTemplate: (id: number | string) => `btn_delete_template_${id}` as const,
  InputTemplateName: 'input_template_name',
  BtnSaveTemplate: 'btn_save_template',
} as const
```

Add export to `frontend/src/testIds/index.ts`.

---

## Data Flow

### Flow 1: Apply Template (chip click)

```
User clicks chip in TemplateQuickChips
  ↓
TemplateQuickChips.applyTemplate(tpl)
  ↓
useFormContext().reset({ ...templateFields, date: today, amount: 0 })
  ↓
RHF replaces entire form state; all dirty flags cleared
  ↓
setTimeout(() => setFocus("amount"), 0)
  ↓
User sees form pre-filled; cursor in amount field; types amount → submits
```

No API call on apply. Templates are already loaded in cache via `useTemplates`.

### Flow 2: Create Template (API)

```
User clicks "Salvar como template" in CreateTransactionDrawer
  ↓
SaveAsTemplateButton reads getValues() from form
  ↓
useCreateTemplate().mutation.mutate(payload)
  ↓
POST /api/transaction-templates (fetch in src/api/templates.ts)
  ↓
TemplateHandler.Create
  ↓
TemplateService.Create (validates cap, sets userID)
  ↓
TemplateRepository.Create (INSERT + tag association)
  ↓
200 response → invalidate QueryKeys.TransactionTemplates
  ↓
TemplateQuickChips re-renders with new chip
```

### Flow 3: Manage Templates (drawer)

```
User opens TemplatesManagementDrawer
  ↓
useTemplates() — already cached from chip row mount
  ↓
List renders; user edits/deletes
  ↓
useUpdateTemplate / useDeleteTemplate mutations fire
  ↓
PUT/DELETE /api/transaction-templates/:id
  ↓
Service verifies ownership; repo executes
  ↓
Response → invalidate QueryKeys.TransactionTemplates
  ↓
Chip row and management list both update from shared cache
```

---

## New Files vs Modified Files

### New Backend Files

| Path | Purpose |
|------|---------|
| `backend/migrations/<ts>_create_transaction_templates_table.sql` | DB schema: `transaction_templates` + `template_tags` join table |
| `backend/internal/domain/transaction_template.go` | Domain types: `TransactionTemplate`, `CreateRequest`, `UpdateRequest`, `Filter` |
| `backend/internal/entity/transaction_template.go` | GORM entity with JSONB split, many2many tags, `ToDomain()` / `FromDomain()` |
| `backend/internal/repository/template_repository.go` | `transactionTemplateRepository` implementing `TransactionTemplateRepository` |
| `backend/internal/service/template_service.go` | `transactionTemplateService` with cap enforcement + IDOR |
| `backend/internal/handler/template_handler.go` | Echo handlers: List, Create, Update, Delete + Swagger annotations |

### Modified Backend Files

| Path | Change |
|------|--------|
| `backend/internal/repository/interfaces.go` | Add `TransactionTemplateRepository` interface; add `TransactionTemplate` field to `Repositories` struct |
| `backend/internal/service/interfaces.go` | Add `TransactionTemplateService` interface; add `TransactionTemplate` field to `Services` struct |
| `backend/cmd/server/main.go` | Instantiate repo + service; add handler to `apiHandlers`; register routes in `registerAPIRoutes` |
| `backend/pkg/errors/errors.go` | Add `TEMPLATE.*` ErrorTag constants |
| `backend/mocks/` | Regenerate after interface changes (`just generate-mocks`) |

### New Frontend Files

| Path | Purpose |
|------|---------|
| `frontend/src/api/templates.ts` | Raw fetch functions for all 4 CRUD operations |
| `frontend/src/types/templates.ts` | `Templates` namespace with TS types |
| `frontend/src/hooks/useTemplates.ts` | Query hook returning `{ query, invalidate }` |
| `frontend/src/hooks/useCreateTemplate.ts` | Mutation hook |
| `frontend/src/hooks/useUpdateTemplate.ts` | Mutation hook |
| `frontend/src/hooks/useDeleteTemplate.ts` | Mutation hook |
| `frontend/src/components/transactions/form/TemplateQuickChips.tsx` | Chip row component using `useFormContext` + `reset()` |
| `frontend/src/components/transactions/form/TemplateQuickChips.module.css` | Chip styles (copy or import from DateQuickChips.module.css) |
| `frontend/src/components/transactions/form/templateFormSchema.ts` | Zod schema for template create/edit form (no amount/date) |
| `frontend/src/components/transactions/TemplatesManagementDrawer.tsx` | Drawer with list + create/edit/delete |
| `frontend/src/components/transactions/TemplateForm.tsx` | RHF form for creating/editing a template |
| `frontend/src/testIds/templates.ts` | All `data-testid` constants for template UI |

### Modified Frontend Files

| Path | Change |
|------|--------|
| `frontend/src/components/transactions/form/TransactionForm.tsx` | Mount `<TemplateQuickChips />` at top of Stack; pass `extraContent` for Save-as-template button |
| `frontend/src/components/transactions/CreateTransactionDrawer.tsx` | Add `SaveAsTemplateButton` via `extraContent` prop; wire `existingTags` |
| `frontend/src/utils/queryKeys.ts` | Add `TransactionTemplates: 'transaction-templates'` |
| `frontend/src/testIds/index.ts` | Re-export `TemplatesTestIds` from new `templates.ts` |

---

## Suggested Build Order

### Phase 1: Backend Foundation (migration + domain + entity)

1. `just migrate-create create_transaction_templates_table` → edit generated file with schema above
2. `just migrate-up` to verify schema applies cleanly
3. Write `backend/internal/domain/transaction_template.go`
4. Write `backend/internal/entity/transaction_template.go`

No runtime dependencies; fully reviewable in isolation.

### Phase 2: Backend Repository

1. Add `TransactionTemplateRepository` interface to `repository/interfaces.go`; add field to `Repositories` struct
2. Write `backend/internal/repository/template_repository.go`
3. `just generate-mocks` → produces `mock_TransactionTemplateRepository.go`
4. Write unit tests using mock-free repo against real DB (follow `ServiceTestWithDBSuite` pattern)

Depends on Phase 1 (entity must exist).

### Phase 3: Backend Service + Errors

1. Add `TEMPLATE.*` ErrorTag constants to `pkg/errors/errors.go`
2. Add `TransactionTemplateService` interface to `service/interfaces.go`; add field to `Services` struct
3. Write `backend/internal/service/template_service.go` with cap enforcement
4. `just generate-mocks` → produces `mock_TransactionTemplateService.go`
5. Write unit tests for cap enforcement (Create when count=3 → error)

Depends on Phase 2.

### Phase 4: Backend Handler + Wiring + Docs

1. Wire repo + service in `cmd/server/main.go`
2. Write `backend/internal/handler/template_handler.go` with Swagger annotations
3. Add handler + routes to `main.go`
4. `just generate-docs`
5. Smoke-test with `curl` or Swagger UI

Depends on Phase 3. The backend is now fully shippable.

### Phase 5: Frontend Apply Flow (chip row)

1. Add `TransactionTemplates` to `queryKeys.ts`
2. Add `frontend/src/types/templates.ts`
3. Write `frontend/src/api/templates.ts`
4. Write `frontend/src/hooks/useTemplates.ts`
5. Write `frontend/src/testIds/templates.ts`; export from `index.ts`
6. Write `TemplateQuickChips.tsx` + `.module.css`
7. Mount `<TemplateQuickChips />` in `TransactionForm.tsx`

At this point the chip row renders (empty until templates exist) and the apply/reset flow is testable.

### Phase 6: Frontend Management UI

1. Write `templateFormSchema.ts`
2. Write `TemplateForm.tsx` (RHF form, subset of transaction fields)
3. Write `TemplatesManagementDrawer.tsx` (list + create/edit/delete)
4. Write mutation hooks (`useCreateTemplate`, `useUpdateTemplate`, `useDeleteTemplate`)
5. Add "Salvar como template" button to `CreateTransactionDrawer` via `extraContent`

### Phase 7: E2E tests

1. e2e: create template → verify chip appears in form
2. e2e: click chip → verify form reset with amount blank and focused
3. e2e: save-as-template from form → verify management drawer shows it
4. e2e: cap enforcement → verify 4th create is blocked

---

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Separate `transaction_templates` table (not `is_template` flag on transactions) | Isolates templates from all balance/listing/charge/settlement queries — no risk of financial reads accidentally including templates. Confirmed in PROJECT.md Key Decisions. |
| Tags via join table `template_tags`, not JSONB | Tags are a first-class entity with FK integrity. JSONB would make tag deletion non-cascading and tag rename non-propagating. Join table mirrors `transaction_tags` pattern. |
| Split config via JSONB column | Split settings are not a first-class entity (no `split_settings` table). They are create-time input. JSONB on the template matches how the domain already treats them — as an opaque input struct — while keeping the column count low. Only `connection_id` + `percentage` fields are semantically meaningful in a template (no amount, no date); the service ignores amount/date on read. |
| Reuse `domain.SplitSettings` for JSONB serialization | No new type needed. The existing struct's json tags serialize correctly. The non-json-tagged `UserConnection *UserConnection` field is a runtime pointer that does not appear in JSON output. |
| `reset()` not `setValue()` for chip apply | `reset()` atomically replaces all form state and clears dirty/error state. `setValue()` leaves stale dirty flags and validation errors from prior user input. `reset()` is the canonical RHF "load a preset" pattern. |
| `setTimeout(() => setFocus("amount"), 0)` after reset | RHF `reset()` updates state asynchronously via React state batching. A microtask delay ensures the DOM has re-rendered with the new values before `setFocus` runs. The `useFocusFieldOnMount` hook is only for mount — it does not fire on subsequent chip clicks. |
| `getValues()` (not `watch`) for Save-as-template | One-shot read at button click. No subscription needed; no re-renders. |
| 3-template cap enforced in service (not DB CHECK) | A DB CHECK would require a trigger or deferred constraint in PostgreSQL. Service-level validation with a clear error tag is simpler, testable, and consistent with how other domain limits are enforced (e.g. split percentage validation). |
| `account_id` / `category_id` nullable with SET NULL on FK delete | A deleted account/category should not delete the template. The template becomes partially stale; the management UI can surface a warning. |

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Migration schema | HIGH | Directly modeled on `push_subscriptions` and `transaction_tags` migration patterns from codebase |
| Domain / Entity layer | HIGH | Direct inspection; SplitSettings reuse confirmed from `transaction.go` |
| Repository layer | HIGH | Mirrors `transactionRepository.Update` tag-association pattern exactly |
| Service layer | HIGH | Cap enforcement is straightforward; IDOR pattern matches `chargeService` |
| Handler + wiring | HIGH | Follows `tagHandler` + `chargeHandler` patterns exactly |
| Frontend chip apply flow | HIGH | `useFormContext` + `reset()` + `setFocus` — all confirmed against existing codebase |
| JSONB split serialization | MEDIUM | Standard GORM JSONB pattern; `json.Marshal`/`Unmarshal` on `[]domain.SplitSettings` — serialization correctness of the `UserConnection *UserConnection` pointer field should be verified with a unit test |
| `CurrencyInput` blank-on-zero behavior | MEDIUM | Not verified — `CurrencyInput.tsx` was not read in full. If `amount: 0` does not visually clear the field, the service can reset to `undefined` instead and the Zod schema `z.number().int().min(1)` will still require the user to enter a value before submit. |
