# Stack Research: Transaction Templates (v1.7)

**Project:** Couples Finance App — v1.7 Transaction Templates Milestone
**Researched:** 2026-06-07
**Confidence:** HIGH — all findings based on direct inspection of go.mod, package.json, and existing entity/domain/component files in the repo.

---

## New Dependencies Required

**Backend: NONE. Frontend: NONE.**

Every technical need for the templates feature maps exactly onto existing mechanisms in the codebase. No new packages are needed in `go.mod` or `package.json`.

---

## Backend: Specific Techniques to Use

### JSONB for Split Config — Use the Existing Custom `JSONB` Type

`gorm.io/datatypes` is NOT in `go.mod` and must NOT be added. The repo already has a hand-rolled JSONB solution in `internal/entity/user_settings.go`:

```go
// entity/user_settings.go — already exists, do not duplicate

type JSONB map[string]interface{}

func (j JSONB) Value() (driver.Value, error) { ... }   // driver.Valuer
func (JSONB) GormDataType() string { return "jsonb" }  // tells GORM the column type
func (j *JSONB) Scan(value interface{}) error { ... }  // sql.Scanner
```

**For the template split config, do not use `map[string]interface{}` as the domain type.** That erases structure. Instead, define a strongly-typed domain struct (`TemplateSplitSetting`) in `internal/domain/`, then write a purpose-built entity field type that implements `driver.Valuer` / `sql.Scanner` over `[]domain.TemplateSplitSetting` — same mechanical pattern, typed payload:

```go
// internal/entity/transaction_template.go

type TemplateSplitSettingsJSON []domain.TemplateSplitSetting

func (t TemplateSplitSettingsJSON) Value() (driver.Value, error) {
    if t == nil {
        return nil, nil
    }
    return json.Marshal(t)
}

func (TemplateSplitSettingsJSON) GormDataType() string { return "jsonb" }

func (t *TemplateSplitSettingsJSON) Scan(value interface{}) error {
    if value == nil {
        *t = nil
        return nil
    }
    b, ok := value.([]byte)
    if !ok {
        return nil
    }
    return json.Unmarshal(b, t)
}
```

This gives compile-time type safety on the split settings slice without importing `gorm.io/datatypes`. The existing `JSONB` type in `user_settings.go` stays as-is (it serves `settings JSONB NOT NULL DEFAULT '{}'`, a freeform map).

**Why not reuse the existing `JSONB` type?** The existing `JSONB` is `map[string]interface{}` — untyped by design, because user settings are a freeform bag. Template split settings are a typed array of `{ connection_id, percentage?, amount? }`. Forcing them into a freeform map loses type safety at the domain and service layers.

### Nullable Columns — Idiomatic GORM Approach

The `transactions` table declares `amount BIGINT NOT NULL` and `date DATE NOT NULL`. The `transaction_templates` table simply omits those columns entirely. This is the cleanest design: no `NULL` handling needed for `amount` or `date` on the template entity. Other fields that are nullable in transactions remain nullable in the same way:

| Field | transactions | transaction_templates | Notes |
|-------|-------------|-----------------------|-------|
| `amount` | `BIGINT NOT NULL` | not present | Omit entirely |
| `date` | `DATE NOT NULL` | not present | Omit entirely |
| `category_id` | `INTEGER` (nullable) | `INTEGER` (nullable) | `*int` pointer in Go |
| `description` | `VARCHAR(255) NOT NULL` | `VARCHAR(255) NOT NULL` | Keep NOT NULL; template name/description is required |
| `type` | `transaction_type NOT NULL` | `transaction_type NOT NULL` | Keep NOT NULL |
| `account_id` | `INTEGER NOT NULL` | `INTEGER NOT NULL` (FK to accounts) | Keep NOT NULL |
| `split_settings` | not stored (create-time input) | `JSONB` column | New column, nullable or `NOT NULL DEFAULT '[]'` |

Go pointer fields `*int` for nullable FK columns (e.g. `CategoryID *int`) is the existing pattern throughout every entity in the codebase — no `sql.NullInt64` or `gorm.NullInt64` needed.

### Tags on Templates — Use a Join Table (Same Pattern as `transaction_tags`)

Tags on transactions use `many2many:transaction_tags`. Templates need the same relationship via a `template_tags` join table:

```go
// entity/transaction_template.go
type TransactionTemplate struct {
    ID          int
    UserID      int
    Name        string
    Type        domain.TransactionType
    AccountID   int
    CategoryID  *int
    Description string
    SplitSettings TemplateSplitSettingsJSON
    Tags        []Tag `gorm:"many2many:template_tags;joinForeignKey:template_id;joinReferences:tag_id"`
    CreatedAt   *time.Time
    UpdatedAt   *time.Time
}
```

The `template_tags` join table needs a Goose migration. The `Tags []Tag` association reuses the existing `entity.Tag` struct — no duplication.

### Cap of 3 Templates Per User — Enforce in Service, Not DB

Enforce in the service layer (`COUNT` query before insert, return `ServiceError` with `ErrCodeBadRequest` and a new `TEMPLATE.MAX_TEMPLATES_REACHED` error tag). Do not use a DB trigger or partial unique index for the cap — the service-layer pattern is consistent with all other business constraints in this codebase (e.g. split percentage validation, charge status transitions).

### Domain / Entity / Repository Wiring

Follow the exact four-file pattern established by every other domain feature:

1. `internal/domain/transaction_template.go` — `TransactionTemplate`, `TemplateSplitSetting`, `TemplateCreateRequest`, `TemplateUpdateRequest`, `TemplateFilter`
2. `internal/entity/transaction_template.go` — `TransactionTemplate` entity + `TemplateSplitSettingsJSON` type + `ToDomain()` / `TransactionTemplateFromDomain()`
3. `internal/repository/interfaces.go` — add `TransactionTemplateRepository` interface
4. `internal/service/interfaces.go` — add `TransactionTemplateService` interface
5. `internal/handler/transaction_template_handler.go` — four routes: POST, GET (list), PUT/:id, DELETE/:id
6. Wire in `cmd/server/main.go`; run `just generate-mocks`

### Migrations

```
just migrate-create create_transaction_templates
just migrate-create create_template_tags
```

Two separate files: one for the `transaction_templates` table (JSONB split column, FK to users/accounts/categories), one for the `template_tags` join table. The `transaction_templates` table does NOT reference the `transactions` table — it is fully independent.

### Swagger

Handler annotations follow the same template as `transaction_handler.go`. Run `just generate-docs` after adding handler comments.

---

## Frontend: Specific Techniques to Use

### No New Dependencies

| Need | Existing Mechanism | Version |
|------|-------------------|---------|
| API calls + caching | `@tanstack/react-query` | ^5.71.10 |
| Template CRUD mutations | `useMutation` from react-query, pattern from `useCreateTransaction.ts` | same |
| Template form schema | `zod` + `zodResolver` | zod ^4.3.6 |
| Chip row in TransactionForm | `Mantine UnstyledButton` + CSS Module — mirrors `DateQuickChips.tsx` exactly | @mantine/core ^9.2.1 |
| Management drawer | `renderDrawer` + `useDrawerContext` — same pattern as every other drawer | existing util |
| "Save as template" action | `useMutation` call from TransactionForm's footer area | existing |
| TypeScript types | New `Templates` namespace in `src/types/transactions.ts` or a separate `src/types/templates.ts` | — |

### Template Quick-Chip Row — Mirror DateQuickChips Exactly

`DateQuickChips.tsx` is 46 lines. It renders `UnstyledButton` elements inside a Mantine `Group`, uses a CSS Module for the active/inactive chip style, and calls `onChange(value)` on click. The `TemplateQuickChips` component follows the same shape:

- Props: `templates: Templates.Template[]`, `onApply: (template: Templates.Template) => void`
- Render a chip per template (max 3, so layout is never crowded)
- On click: call `onApply(template)` — the caller in `TransactionForm` calls `reset({ ...templateValues, amount: 0, date: todayStr })` then `setFocus('amount')`

The `reset()` call is the mechanism specified in PROJECT.md. React Hook Form's `reset(values)` sets all form fields at once, which is the right tool: it avoids 6-8 individual `setValue` calls and correctly marks the form as not-dirty. After reset, `setFocus('amount')` moves the cursor.

**Do not** use `setValue` field-by-field for template apply. `reset()` is idiomatic for "load a new set of defaults".

### Template Form Schema

The template's Zod schema is a strict subset of `baseTransactionFields` from `transactionFormSchema.ts` — specifically, `transaction_type`, `account_id`, `category_id`, `description`, `split_settings`, and `tags`. It explicitly omits `amount`, `date`, `recurrenceEnabled`, `recurrenceType`, `recurrenceCurrentInstallment`, `recurrenceTotalInstallments`. The `name` field (template label for the chip) is added.

Reuse `splitSettingSchema` from `transactionFormSchema.ts` for the split settings array. Do not duplicate it.

### Query Key

Add `Templates: 'transaction-templates'` to `src/utils/queryKeys.ts` before writing any query hook.

### TypeScript Type for Template

Add to `src/types/transactions.ts` inside the `Transactions` namespace (or a peer `Templates` namespace):

```typescript
export interface TransactionTemplate {
  id: number;
  user_id: number;
  name: string;
  transaction_type: TransactionType;
  account_id: number;
  category_id: number | null;
  description: string;
  split_settings: Array<{
    connection_id: number;
    percentage?: number;
    amount?: number;
  }>;
  tags: Tag[];
  created_at?: string;
  updated_at?: string;
}
```

### "Save as Template" Action

This does NOT open a new form from scratch. It reads the current `TransactionForm` field values via `getValues()` (React Hook Form), strips `amount`/`date`/recurrence fields, and calls `createTemplate(payload)`. If the user already has 3 templates, the API returns a 400 with tag `TEMPLATE.MAX_TEMPLATES_REACHED` — surface this as a toast/alert, do not silently swallow it.

---

## What NOT to Add

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `gorm.io/datatypes` | Not in go.mod; the repo already has a hand-rolled `JSONB` type with `driver.Valuer`/`sql.Scanner` in `entity/user_settings.go` | Custom `TemplateSplitSettingsJSON` type following the same pattern |
| `sql.NullInt64` / `gorm.NullInt64` | Not used anywhere in the codebase | `*int` pointer (existing pattern) |
| DB trigger for 3-template cap | Inconsistent with the service-layer validation pattern used everywhere else | Count check in service + `ServiceError` with tag |
| `is_template` boolean on the `transactions` table | Explicitly rejected in PROJECT.md Key Decisions: "Dedicated `transaction_templates` table (not an `is_template` column)" | Separate `transaction_templates` table |
| `zustand` or other client state for templates | Templates are server state, not UI state | TanStack Query cache |
| New icon library | `@tabler/icons-react` is already present with thousands of icons | Use existing tabler icons |
| New form component library | Mantine covers chip-style buttons via `UnstyledButton` + CSS Module | `UnstyledButton` + `DateQuickChips.module.css` pattern |

---

## Existing Patterns to Reuse (with file references)

| Pattern | Reference File | Applies To |
|---------|---------------|------------|
| Custom JSONB Scanner/Valuer | `backend/internal/entity/user_settings.go` | `TemplateSplitSettingsJSON` entity field |
| Tags many2many join table | `backend/internal/entity/transaction.go` (`transaction_tags`) | `template_tags` join table |
| `*int` for nullable FKs | Every entity file (e.g. `CategoryID *int` in `Transaction`) | `CategoryID *int` on template entity |
| Service-layer count cap | Charge status validation in `charge_service.go` | 3-template-per-user cap |
| Quick-chip component | `frontend/src/components/transactions/form/DateQuickChips.tsx` | `TemplateQuickChips` component |
| `reset()` for form prefill | `useResetFormOnChange.ts` hook | Template apply → `reset()` + `setFocus('amount')` |
| renderDrawer + useDrawerContext | Every drawer in `src/components/` | Template management drawer |
| `useCreateTransaction` mutation pattern | `frontend/src/hooks/useCreateTransaction.ts` | `useCreateTemplate`, `useUpdateTemplate`, `useDeleteTemplate` |
| `baseTransactionFields` + `splitSettingSchema` | `frontend/src/components/transactions/form/transactionFormSchema.ts` | Template form Zod schema |

---

## Sources

- Direct inspection of `backend/go.mod` — confirmed `gorm.io/datatypes` is NOT present; `gorm.io/gorm v1.31.1` and `gorm.io/driver/postgres v1.6.0` are the only GORM dependencies
- Direct inspection of `backend/internal/entity/user_settings.go` — confirmed hand-rolled `JSONB` type with `driver.Valuer` / `sql.Scanner` / `GormDataType()` is already in the codebase
- Direct inspection of `backend/migrations/00001_initial_schema.up.sql` — confirmed `user_settings.settings` is already `JSONB` in production; no `gorm.io/datatypes` was required to support it
- Direct inspection of `frontend/package.json` — confirmed all required frontend libraries are present at current versions; no new dependencies needed
- Direct inspection of `frontend/src/components/transactions/form/DateQuickChips.tsx` — confirmed chip pattern uses `UnstyledButton` + CSS Module; 46 lines, directly reusable as template
- Direct inspection of `frontend/src/components/transactions/form/transactionFormSchema.ts` — confirmed `splitSettingSchema` and `baseTransactionFields` are exported and reusable
- Direct inspection of `frontend/src/utils/queryKeys.ts` — confirmed `Templates` key does not yet exist and must be added

---

*Stack research for: v1.7 Transaction Templates — brownfield addition to existing couples finance app*
*Researched: 2026-06-07*
