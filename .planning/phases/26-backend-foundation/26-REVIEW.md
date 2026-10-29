---
phase: 26-backend-foundation
reviewed: 2026-06-14T00:00:00Z
depth: deep
files_reviewed: 5
files_reviewed_list:
  - backend/migrations/20260614113105_create_transaction_templates_table.sql
  - backend/internal/domain/transaction_template.go
  - backend/internal/domain/transaction_template_test.go
  - backend/internal/entity/transaction_template.go
  - backend/internal/entity/transaction_template_test.go
findings:
  critical: 0
  warning: 2
  info: 2
  total: 4
status: issues
---

# Phase 26: Code Review Report

**Reviewed:** 2026-06-14T00:00:00Z
**Depth:** deep
**Files Reviewed:** 5
**Status:** issues_found

## Summary

The data foundation for transaction templates is well-structured. The migration is correct, the domain type is clean, and the entity converters faithfully follow the project's established patterns (matching `user_settings.go` and `account.go`). JSONB Scan/Value mechanics are sound, both split modes round-trip correctly, and the isolation guarantee (no joins into existing financial queries) is preserved.

Two warnings surface — one is a behavior issue that will write unexpected data into the DB from day one, the other is a correctness gap in the JSONB Scan that mirrors a pre-existing project flaw. Two info items flag minor test quality issues.

---

## Warnings

### WR-01: `SplitSettings.UserConnection` has no `json:"-"` tag — it will be serialized into the JSONB payload column

**File:** `backend/internal/entity/transaction_template.go:17` (via `domain.SplitSettings` at `backend/internal/domain/transaction.go:172`)

**Issue:** `domain.SplitSettings` embeds a runtime-only pointer `UserConnection *UserConnection` with no JSON struct tag. Go's `encoding/json` marshals untagged exported fields by their Go name, so when `TransactionTemplatePayload.Value()` calls `json.Marshal(p)`, every split row gains `"UserConnection":null` in the stored JSONB. The column will silently accumulate this extra key for every template that has split settings:

```json
{
  "split_settings": [
    {"connection_id": 1, "percentage": 50, "UserConnection": null}
  ]
}
```

This bloats every stored payload, and when the payload is later returned to the frontend (Phase 27 / Phase 30), the `"UserConnection": null` key appears in each split row — an internal Go pointer leaked into the API surface. The field's purpose is resolved-entity caching inside the service layer, not persistence or serialization.

**Fix:** Add `json:"-"` to `SplitSettings.UserConnection` in `backend/internal/domain/transaction.go`:

```go
type SplitSettings struct {
    ConnectionID   int             `json:"connection_id"`
    UserConnection *UserConnection `json:"-"`   // runtime only — never serialize
    Percentage     *int            `json:"percentage,omitempty"`
    Amount         *int64          `json:"amount,omitempty"`
    Date           *Date           `json:"date,omitempty"`
}
```

Note: `domain.SplitSettings` is shared with the existing transaction code path where `UserConnection` is also marshaled into `TransactionCreateRequest` / `SplitSettings` responses. Verify that no existing handler or service serializes a `SplitSettings` slice directly to JSON and relies on the `UserConnection` key being present; a quick `grep -r '"UserConnection"'` over the frontend confirms there is no such dependency before making this change. If existing callers depend on it, add a separate payload-only struct for the template side instead.

---

### WR-02: `Scan()` silently succeeds on non-`[]byte` driver value, leaving payload at zero value

**File:** `backend/internal/entity/transaction_template.go:29-31`

**Issue:** If the database driver returns the JSONB column value as a `string` (which `lib/pq` and some `pgx` configurations do for `JSONB` columns), the type assertion `value.([]byte)` fails and `Scan()` returns `nil` with `p` unchanged — a zero-value `TransactionTemplatePayload`. The error is swallowed without any indication of data loss:

```go
bytes, ok := value.([]byte)
if !ok {
    return nil   // silent data loss: payload becomes zero-value struct
}
```

This is the same pattern as `entity/user_settings.go:32-34` (the canonical analog), so it is a pre-existing project issue rather than a regression introduced here. However, the template payload is typed (struct, not `map[string]interface{}`), making the silent-zero outcome more consequential: a misconfigured driver would serve empty template payloads with no log or error.

**Fix:** Handle `string` as a second accepted type, consistent with what `pgx/v5` returns for text-protocol JSONB, and return a real error for any other type:

```go
func (p *TransactionTemplatePayload) Scan(value interface{}) error {
    if value == nil {
        return nil
    }
    var b []byte
    switch v := value.(type) {
    case []byte:
        b = v
    case string:
        b = []byte(v)
    default:
        return fmt.Errorf("TransactionTemplatePayload.Scan: unsupported type %T", value)
    }
    return json.Unmarshal(b, p)
}
```

Applying the same fix to `JSONB.Scan` in `user_settings.go` would close the pre-existing gap project-wide.

---

## Info

### IN-01: Test split rows share the same `ConnectionID` value

**File:** `backend/internal/entity/transaction_template_test.go:30-35`

**Issue:** Both split rows in `TestTransactionTemplateConverterRoundTrip` use `ConnectionID: 1`. The test is checking split-mode preservation (Percentage vs Amount), not connection uniqueness, but identical connection IDs are misleading and would hide a bug if a future implementation de-duplicated split rows by `ConnectionID`.

```go
{ConnectionID: 1, Percentage: ptr(50)},   // row 0
{ConnectionID: 1, Amount: ptr(int64(2500))}, // row 1  <-- same ID as row 0
```

The JSONB round-trip test (`TestTransactionTemplateJSONBRoundTrip`) has the same issue at lines 68-71.

**Fix:** Use distinct `ConnectionID` values in the two rows:

```go
{ConnectionID: 1, Percentage: ptr(50)},
{ConnectionID: 2, Amount: ptr(int64(2500))},
```

---

### IN-02: `TransactionTemplatePayload.Type` field has no `omitempty` — zero-value serializes as `"type":""`

**File:** `backend/internal/domain/transaction_template.go:28`

**Issue:** The `Type TransactionType` field has no `omitempty` tag. When a `TransactionTemplatePayload` is constructed without setting `Type` (e.g., zero-value initialization in tests or during a partial decode), it marshals as `"type":""` into the JSONB column rather than omitting the key. This is benign for Phase 26 (validation is Phase 27), but the stored JSONB will contain an invalid `type` value that must be cleaned up by the Phase 27 strict unmarshal.

**Fix:** Either add `omitempty` so an unset type is omitted from the serialized payload:

```go
Type TransactionType `json:"type,omitempty"`
```

Or — since `type` is always required for a valid payload — rely on Phase 27's strict validation to reject zero-value `type` before it reaches the column. If the latter, add a comment documenting the invariant.

---

_Reviewed: 2026-06-14T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
