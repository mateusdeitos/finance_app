## 1. Backend: Structured Error Response with Tags

- [x] 1.1 Add `Tags []string` field to `ErrorResponse` in `internal/middleware/error_handler.go` (`json:"tags,omitempty"`) and update the handler to populate it from the HTTP error's `Tags` field when present
- [x] 1.2 Update `pkg/errors/errors.go`: extend `ToHTTPError` to handle `ServiceErrors` (the slice type) — iterate all entries, collect `.Tags` from each into a flat deduplicated slice, determine HTTP status from the first error's code, return an `echo.HTTPError` that carries the tags so the error handler can serialize them
- [x] 1.3 Fix `TransactionHandler.Create` in `internal/handler/transaction_handler.go`: replace `echo.NewHTTPError(http.StatusBadRequest, err.Error())` with `pkgErrors.ToHTTPError(err)` so tags are preserved through to the response

## 2. Backend: Transaction Suggestions Endpoint

- [x] 2.1 Add `Suggestions` handler method to `TransactionHandler` in `internal/handler/transaction_handler.go` — query param `q` (required), `limit` (default 10, max 50); use existing `TransactionFilter` with `Description.Query`; return `[]domain.Transaction` (reuse existing JSON shape)
- [x] 2.2 Register `GET /api/transactions/suggestions` route in the router (same auth middleware group as other transaction routes)
- [x] 2.3 Add Swagger annotations to the `Suggestions` handler method; run `just generate-docs`

## 3. Frontend: Error Parsing Utility

- [x] 3.1 Create `src/utils/apiErrors.ts`:
  - `ApiErrorResponse` type: `{ error: string; message: string; tags: string[] }`
  - `parseApiError(res: Response): Promise<ApiErrorResponse>` — reads JSON body and returns the typed error
  - `mapTagsToFieldErrors(tags: string[], message: string): Record<string, string>` — maps known error tags to form field paths (see design.md tag-to-field table); handles indexed split-settings tags by extracting the `INDEX_N` value from the tags array and building `split_settings.N.<subfield>` paths; unmapped tags are collected under the `_general` key

## 4. Frontend Types

- [x] 4.1 Add `TransactionSuggestion` type to `src/types/transactions.ts` (fields: `id`, `description`, `type`, `amount`, `account_id`, `category_id`, `tags`)
- [x] 4.2 Add `CreateTransactionPayload` type to `src/types/transactions.ts` matching `TransactionCreateRequest` from the backend

## 5. Frontend API

- [x] 5.1 Add `fetchTransactionSuggestions(q: string, limit?: number)` to `src/api/transactions.ts` — calls `GET /api/transactions/suggestions`
- [x] 5.2 Add `createTransaction(payload: Transactions.CreateTransactionPayload)` to `src/api/transactions.ts` — calls `POST /api/transactions`; on non-2xx throws the raw `Response` so the caller can `parseApiError`

## 6. Hooks

- [x] 6.1 Create `src/hooks/useCreateTransaction.ts` — mutation using `createTransaction`; on success calls `queryClient.invalidateQueries` for both `QueryKeys.Transactions` and `QueryKeys.Tags` (tags may have been created server-side); on error, calls `parseApiError` then `mapTagsToFieldErrors` and invokes an `onFieldErrors(errors: Record<string, string>)` callback so the form can call `setErrors`/`setError` directly
- [x] 6.2 Create `src/hooks/useTransactionPrefill.ts` — reads/writes `localStorage` under key `create-transaction-prefill:{userId}`; exposes `prefill` (date, categoryId, accountId) and `savePrefill(date, categoryId, accountId)`; validates IDs against provided accounts/categories lists and discards stale values

## 7. Description Autocomplete Component

- [x] 7.1 Create `src/components/transactions/form/DescriptionAutocomplete.tsx` — Mantine `Autocomplete` with 300 ms debounce; calls `fetchTransactionSuggestions` on value change; on item select calls `onSuggestionSelect(suggestion: TransactionSuggestion)` prop; accepts `error` prop and forwards it to the Mantine component for red-border + inline message display

## 8. Recurrence Fields Component

- [x] 8.1 Create `src/components/transactions/form/RecurrenceFields.tsx` — toggle to enable recurrence; when enabled: `type` select (`daily`, `weekly`, `monthly`, `yearly`), then mutually exclusive choice of `repetitions` number input OR `end_date` date picker (switching between them clears the other); accepts `errors` prop (`{ type?: string; repetitions?: string; end_date?: string; _general?: string }`) and passes each to the corresponding Mantine field's `error` prop

## 9. Split Settings Fields Component

- [x] 9.1 Create `src/components/transactions/form/SplitSettingsFields.tsx` — renders one row per active user connection; each row: partner name, toggle between percentage/amount mode, numeric input; validates that percentage splits sum to 100 or amount splits sum to the form's total amount; accepts `errors` prop keyed by split index (e.g. `{ "0.amount": "Amount must be greater than zero" }`) and passes each to the corresponding field's `error` prop; shows a general `split_settings` error above the list when present

## 10. Transaction Form Component

- [x] 10.1 Create `src/components/transactions/form/TransactionForm.tsx` — composes all form fields using `useForm` (Mantine or react-hook-form); fields: Type (SegmentedControl or Select), Date (DatePicker), DescriptionAutocomplete, Amount (NumberInput in BRL), Category (Select, hidden for transfer), Account (Select), Destination Account (Select, visible only for transfer), SplitSettingsFields (hidden for transfer), RecurrenceFields, Tags (Mantine `TagsInput` or creatable `MultiSelect`: filters existing tags from `useTags` client-side by typed value; when typed value has no match, shows a "Create «name»" option; selected tags stored as `{ id?, name }` objects — existing tags carry their id, new ones have only name; all sent in the `tags` array of the payload, backend creates new ones inline)
- [x] 10.2 When type changes to `transfer`, clear split settings and hide Category
- [x] 10.3 On suggestion select (from DescriptionAutocomplete), populate type, amount, category, account, tags, split settings — leave date and recurrence untouched
- [x] 10.4 Pass `onFieldErrors` to `useCreateTransaction`; in that callback call the form's `setErrors` (or `setError`) so each field picks up its error state; render a `_general` error banner (Mantine `Alert` with `color="red"`) at the top of the form when `errors._general` is set
- [x] 10.5 On successful submit, call `savePrefill(date, categoryId, accountId)` and close the drawer

## 11. Create Transaction Drawer

- [x] 11.1 Create `src/components/transactions/CreateTransactionDrawer.tsx` — Mantine `Drawer` at `position="right"`, `size="md"`; renders `TransactionForm`; on open, initializes form from `useTransactionPrefill` (validates IDs against loaded accounts/categories)

## 12. Wire Up in Route

- [x] 12.1 In `src/routes/_authenticated.transactions.tsx`, add `useDisclosure` for the new drawer and render `CreateTransactionDrawer`
- [x] 12.2 Add "Nova Transação" `Button` (with `+` icon) to the top-right of the period filter row on both desktop and mobile layouts; clicking it calls `openDrawer`
