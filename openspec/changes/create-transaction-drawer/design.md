## Context

The transactions list screen (`_authenticated.transactions.tsx`) has a sticky header row containing `PeriodNavigator` and `TransactionFilters`. The "New Transaction" button will be placed in this row. The form itself opens in a Mantine `Drawer` at `position="right"`.

The backend already exposes `POST /api/transactions` for creation and `GET /api/transactions` with `description.query` text search. A dedicated suggestions endpoint will be added to return a lightweight list of distinct transactions for autocomplete, keeping the response small.

## Goals / Non-Goals

**Goals:**

- New transaction button in period filter row on desktop and mobile.
- Right-side drawer with all required form fields.
- Autocomplete description field backed by a new backend suggestions endpoint.
- Tags field with autocomplete over existing tags and inline creation of new tags.
- Structured error responses from the backend that include error tags.
- Frontend error parser that maps error tags to specific form fields, showing a red border and error message inline below each affected field.
- Scalable tag-to-field mapping utility reusable across future forms.
- Post-submit invalidation of the transactions query.
- localStorage persistence of date, category, and account for prefill.

**Non-Goals:**

- Editing or deleting existing transactions (out of scope).
- Real-time collaboration or optimistic updates.
- Full duplicate detection (autocomplete is suggestion-only).

## Decisions

### Decision: Dedicated suggestions endpoint vs. reusing GET /api/transactions

**Choice**: Add `GET /api/transactions/suggestions?q=<text>&limit=10` returning `[]{id, description, type, amount, category_id, account_id, tag_ids}`.
**Alternative considered**: Call the full `GET /api/transactions` with a description query and filter client-side. Rejected — the full endpoint requires `month`/`year` and returns the complete transaction object for an unbounded period; a dedicated endpoint avoids over-fetching and can be scoped to distinct descriptions across all time.

### Decision: Autocomplete triggers on keystroke with debounce

**Choice**: Debounce the description input at 300 ms before firing the suggestions request. Use Mantine `Autocomplete` component.
**Rationale**: Avoids a request per keystroke; 300 ms is fast enough to feel responsive.

### Decision: Suggestion selection copies all fields except date and recurrence

**Choice**: When the user selects a suggestion, populate type, amount, category, account, tags, and split settings from the selected transaction. Leave date and recurrence settings untouched.
**Rationale**: Matches the stated requirement; date and recurrence are always session-specific.

### Decision: localStorage key per-user

**Choice**: Persist prefill values under the key `create-transaction-prefill:{userId}` so multiple users on the same browser don't share prefills.
**Rationale**: Couples may share devices; mixing prefill state would be confusing.

### Decision: Split settings UI

**Choice**: When type ≠ `transfer`, show the user's active connections as split targets. Each split entry shows the partner's name, a percentage or amount toggle, and an input. Total must equal 100% (or total amount) before submission.
**Rationale**: Matches the existing `SplitSettings` domain structure (`connection_id` + `percentage` xor `amount`).

### Decision: Recurrence settings UI

**Choice**: A toggle to enable recurrence. When enabled, show `type` select (`daily`, `weekly`, `monthly`, `yearly`) and a choice between `repetitions` (number input) or `end_date` (date picker) — mutually exclusive.
**Rationale**: Maps directly to `RecurrenceSettings` domain type.

### Decision: Backend error response must include tags

**Choice**: Extend `ErrorResponse` in `internal/middleware/error_handler.go` to include `tags []string`. Update `pkg/errors.ToHTTPError` to handle `ServiceErrors` (the slice type, currently unhandled — falls through to 500) by collecting all tags from all errors. Fix the `Create` transaction handler to use `pkgErrors.ToHTTPError(err)` instead of the current `echo.NewHTTPError(http.StatusBadRequest, err.Error())` which discards tags entirely.
**Rationale**: Tags are the stable, machine-readable identifiers for what went wrong. Without them in the response, the frontend must parse free-text messages — brittle and unscalable.

**Updated `ErrorResponse`**:

```go
type ErrorResponse struct {
    Error   string   `json:"error"`
    Message string   `json:"message,omitempty"`
    Tags    []string `json:"tags,omitempty"`
}
```

**Tag collection logic** (in `ToHTTPError` for `ServiceErrors`): iterate all `*ServiceError` entries, collect `.Tags` from each into a deduplicated flat slice, use the first error's code to determine HTTP status. Indexed tags like `INDEX_1` come through naturally since they're just strings in the slice.

### Decision: Frontend error parser utility

**Choice**: Create `src/utils/apiErrors.ts` with:

- `ApiErrorResponse` type matching the updated backend shape
- `parseApiError(res: Response): Promise<ApiErrorResponse>` — fetches and parses the JSON error body
- `mapTagsToFieldErrors(tags: string[], message: string): Record<string, string>` — maps known tags to form field paths, returns a dict of `fieldPath → errorMessage`

The mapper handles two tag patterns:

1. **Simple**: `TRANSACTION.DATE_IS_REQUIRED` → `{ date: "Date is required" }`
2. **Indexed**: tags array contains both `TRANSACTION.SPLIT_SETTING_AMOUNT_MUST_BE_GREATER_THAN_ZERO` and `INDEX_2` → `{ "split_settings.1.amount": "Amount must be greater than zero" }` (index is 0-based in backend, displayed 1-based is irrelevant since it maps to the array position in the form state)

Tags not present in the mapping are collected into a `_general` key shown as a form-level error banner.

**Full tag-to-field map** (all `ErrorTag` values from `pkg/errors/errors.go`):

| Backend tag                                                                           | Form field path                           |
| ------------------------------------------------------------------------------------- | ----------------------------------------- |
| `TRANSACTION.DATE_IS_REQUIRED`                                                        | `date`                                    |
| `TRANSACTION.DESCRIPTION_IS_REQUIRED`                                                 | `description`                             |
| `TRANSACTION.AMOUNT_MUST_BE_GREATER_THAN_ZERO`                                        | `amount`                                  |
| `TRANSACTION.INVALID_TRANSACTION_TYPE`                                                | `type`                                    |
| `TRANSACTION.INVALID_ACCOUNT_ID`                                                      | `account_id`                              |
| `TRANSACTION.INVALID_CATEGORY_ID`                                                     | `category_id`                             |
| `TRANSACTION.MISSING_DESTINATION_ACCOUNT`                                             | `destination_account_id`                  |
| `TRANSACTION.SPLIT_SETTINGS_NOT_ALLOWED_FOR_TRANSFER`                                 | `split_settings`                          |
| `TRANSACTION.SPLIT_ALLOWED_ONLY_FOR_EXPENSE`                                          | `split_settings`                          |
| `TRANSACTION.INVALID_RECURRENCE_TYPE`                                                 | `recurrence_settings.type`                |
| `TRANSACTION.RECURRENCE_END_DATE_OR_REPETITIONS_IS_REQUIRED`                          | `recurrence_settings`                     |
| `TRANSACTION.RECURRENCE_END_DATE_MUST_BE_AFTER_TRANSACTION_DATE`                      | `recurrence_settings.end_date`            |
| `TRANSACTION.RECURRENCE_END_DATE_AND_REPETITIONS_CANNOT_BE_USED_TOGETHER`             | `recurrence_settings`                     |
| `TRANSACTION.RECURRENCE_REPETITIONS_MUST_BE_POSITIVE`                                 | `recurrence_settings.repetitions`         |
| `TRANSACTION.RECURRENCE_REPETITIONS_MUST_BE_LESS_THAN_OR_EQUAL_TO`                    | `recurrence_settings.repetitions`         |
| `TRANSACTION.SPLIT_SETTING_INVALID_CONNECTION_ID` + `INDEX_N`                         | `split_settings.N.connection_id`          |
| `TRANSACTION.SPLIT_SETTING_PERCENTAGE_OR_AMOUNT_IS_REQUIRED` + `INDEX_N`              | `split_settings.N`                        |
| `TRANSACTION.SPLIT_SETTING_PERCENTAGE_AND_AMOUNT_CANNOT_BE_USED_TOGETHER` + `INDEX_N` | `split_settings.N`                        |
| `TRANSACTION.SPLIT_SETTING_PERCENTAGE_MUST_BE_BETWEEN_1_AND_100` + `INDEX_N`          | `split_settings.N.percentage`             |
| `TRANSACTION.SPLIT_SETTING_AMOUNT_MUST_BE_GREATER_THAN_ZERO` + `INDEX_N`              | `split_settings.N.amount`                 |
| `TRANSACTION.SPLIT_SETTING_INVALID_DESTINATION_ACCOUNT_ID` + `INDEX_N`                | `split_settings.N.destination_account_id` |
| `TAG.NAME_CANNOT_BE_EMPTY`                                                            | `tags`                                    |
| `TAG.FAILED_TO_CREATE`                                                                | `tags`                                    |

**Usage in the form**: after a failed mutation, call `mapTagsToFieldErrors(error.tags, error.message)` and pass the result to the form's `setErrors` (Mantine `useForm`) or `setError` (react-hook-form). Each field reads its error from form state and renders red border + message below using the standard Mantine `error` prop pattern.

### Decision: Tags field — autocomplete + inline creation, no pre-flight API call

**Choice**: Use Mantine `TagsInput` (or creatable `MultiSelect`) to filter existing tags by name client-side and allow typing a new name. When submitting, the `tags` array in `CreateTransactionPayload` is sent as `[{ id: <existing>, name: "..." }]` for known tags and `[{ name: "newname" }]` (id omitted / 0) for new ones. The backend's `createTags` method handles creation inline during the transaction create service call — no separate `POST /api/tags` call is needed from the frontend.
**Alternative considered**: Pre-create tags via `POST /api/tags` before submitting the transaction. Rejected — the backend already handles tag creation within the transaction service; a pre-flight call introduces a partial-failure risk and unnecessary complexity.
**Rationale**: `TransactionCreateRequest.Tags` is `[]domain.Tag`; the internal `createTags` call is idempotent per submission. The existing `GET /api/tags` provides the full list upfront for client-side filtering.

## Backend: Suggestions Endpoint

**Route**: `GET /api/transactions/suggestions`

**Query params**: `q` (string, required), `limit` (int, default 10, max 50)

**Logic**:

1. Use the existing `TransactionFilter` with `Description: &domain.TextSearch{Query: q}`.
2. Fetch up to `limit` transactions ordered by `created_at DESC`.
3. De-duplicate by description client-side is fine at small limit; backend returns raw matches.

**Response**:

```json
[
  {
    "id": 1,
    "description": "Supermercado",
    "type": "expense",
    "amount": 15000,
    "account_id": 2,
    "category_id": 5,
    "tags": [{ "id": 3, "name": "food" }]
  }
]
```

**Auth**: same `AuthMiddleware` as all other transaction routes.

## Frontend Architecture

### New files

- `src/components/transactions/CreateTransactionDrawer.tsx` — Drawer wrapper + form state
- `src/components/transactions/form/TransactionForm.tsx` — Form layout and field composition
- `src/components/transactions/form/DescriptionAutocomplete.tsx` — Mantine Autocomplete wrapping suggestions fetch
- `src/components/transactions/form/RecurrenceFields.tsx` — Recurrence toggle + type/repetitions/end_date
- `src/components/transactions/form/SplitSettingsFields.tsx` — Split settings per connection
- `src/api/transactions.ts` — add `fetchTransactionSuggestions(q, limit?)` and `createTransaction(payload)`
- `src/hooks/useCreateTransaction.ts` — mutation hook wrapping `createTransaction`, invalidates `QueryKeys.Transactions` on success; on error, calls `mapTagsToFieldErrors` and sets form errors
- `src/hooks/useTransactionPrefill.ts` — reads/writes localStorage prefill for date, category, account
- `src/utils/apiErrors.ts` — `ApiErrorResponse` type, `parseApiError`, `mapTagsToFieldErrors` utility

### Modified files

- `src/routes/_authenticated.transactions.tsx` — add "New Transaction" button + `useDisclosure` for drawer
- `src/components/transactions/PeriodNavigator.tsx` (or inline in route) — place button in top-right of the filter row
- `src/types/transactions.ts` — add `CreateTransactionPayload`, `TransactionSuggestion` types
### State flow

1. User clicks "New Transaction" → drawer opens.
2. Form initializes from localStorage prefill (date, category, account).
3. User types description → debounced fetch to `/api/transactions/suggestions` → Autocomplete shows options.
4. User selects a suggestion → form fields populated (type, amount, category, account, tags, split settings).
5. User types in Tags field → filters loaded tag list client-side; if typed name has no match, shows "Create «name»" option; selected item is stored as `{ name }` (no id) in form state.
6. User submits → `POST /api/transactions` with `tags: [{ id, name }]` for existing and `[{ name }]` for new — backend creates new tags inline.
   - **On success**: invalidate `QueryKeys.Transactions` and `QueryKeys.Tags` queries, persist date/category/account to localStorage, close drawer.
   - **On error**: call `parseApiError` → `mapTagsToFieldErrors` → set field errors in form state; known-field errors show red border + message inline below the field; unknown tags surface as a general error banner at the top of the form.

## Risks / Trade-offs

- **Split settings validation**: must ensure percentage splits sum to 100% or amount splits sum to total before allowing submit. Display an error message if they don't.
- **Transfer + split conflict**: split settings are hidden when type = `transfer`; clear any stored split settings when type changes to `transfer`.
- **Recurrence repetitions vs end_date**: these are mutually exclusive — switching between them must clear the other field.
- **localStorage staleness**: stored account or category ID may no longer exist (deleted). Validate IDs against loaded accounts/categories on drawer open and discard stale prefill silently.
- **Inline tag creation failure**: if a new tag name fails server-side (e.g. empty after trim), the backend returns `TAG.NAME_CANNOT_BE_EMPTY` or `TAG.FAILED_TO_CREATE` tags; `mapTagsToFieldErrors` maps these to the `tags` field so the error appears below the tags input.
- **`ServiceErrors` currently falls through to 500**: the existing `ToHTTPError` only handles `*ServiceError`, not `ServiceErrors` (the slice). Multi-error responses from validation currently return 500 to the client. This must be fixed as part of this change.
