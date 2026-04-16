---
phase: 08-frontend
reviewed: 2026-04-16T00:00:00Z
depth: standard
files_reviewed: 19
files_reviewed_list:
  - frontend/src/api/charges.ts
  - frontend/src/components/AppLayout.tsx
  - frontend/src/components/charges/AcceptChargeDrawer.tsx
  - frontend/src/components/charges/ChargeCard.module.css
  - frontend/src/components/charges/ChargeCard.tsx
  - frontend/src/components/charges/ChargeStatusBadge.tsx
  - frontend/src/components/charges/CreateChargeDrawer.tsx
  - frontend/src/components/transactions/PeriodNavigator.tsx
  - frontend/src/hooks/useAcceptCharge.ts
  - frontend/src/hooks/useCancelCharge.ts
  - frontend/src/hooks/useCharges.ts
  - frontend/src/hooks/useChargesPendingCount.ts
  - frontend/src/hooks/useCreateCharge.ts
  - frontend/src/hooks/useRejectCharge.ts
  - frontend/src/main.tsx
  - frontend/src/routes/_authenticated.charges.tsx
  - frontend/src/types/charges.ts
  - frontend/src/utils/apiErrors.ts
  - frontend/src/utils/queryKeys.ts
findings:
  critical: 0
  warning: 5
  info: 4
  total: 9
status: issues_found
---

# Phase 08: Code Review Report

**Reviewed:** 2026-04-16T00:00:00Z
**Depth:** standard
**Files Reviewed:** 19
**Status:** issues_found

## Summary

This phase introduces the charges feature: API client, query/mutation hooks, two drawer forms (create and accept), a card component, a status badge, and the main charges page. Overall the code is well-structured and follows the project conventions established in `frontend/CLAUDE.md` — drawer lifecycle, query key usage, mutation hooks, and CSS Modules are all applied correctly.

Five warnings were found, covering a null-assertion risk, an error state silently swallowed in the confirmation modal, an incorrect partner-name derivation strategy, a MonthPickerInput double-defaultValue conflict, and a timezone-unsafe ISO string split. Four informational items cover a connection label that uses an ID instead of a name, a minor naming mismatch, an unused `Direction` type, and a missing `amount` field on the `Charge` type.

No critical (security / crash / data-loss) issues were identified.

---

## Warnings

### WR-01: Non-null assertion on possibly-undefined `currentUserId` causes runtime crash when `me` query is loading

**File:** `frontend/src/routes/_authenticated.charges.tsx:181,213`

**Issue:** `currentUserId` is typed as `number | undefined` (the `useMe` selector can return `undefined` while the query is in flight). Lines 181 and 213 pass it to `ChargeCard` as `currentUserId={currentUserId!}`. If the page renders before the `me` query resolves, `currentUserId` is `undefined`, the non-null assertion silences TypeScript, but `ChargeCard` receives `undefined` at runtime and the `isReceived` comparison (`charge.payer_user_id === currentUserId`) always returns `false`, causing the wrong set of action buttons to render.

**Fix:** Guard rendering until `currentUserId` is available, or provide a safe fallback of `0` (same pattern already used in the drawer components):

```tsx
// Option A — early return / skeleton while loading
const currentUserId = meQuery.data
if (!currentUserId) return <Skeleton />

// Option B — fallback (consistent with drawer pattern)
const currentUserId = meQuery.data ?? 0
// Then remove the ! assertions on lines 181 and 213
```

---

### WR-02: Error state in reject/cancel confirmation modal is silently swallowed

**File:** `frontend/src/routes/_authenticated.charges.tsx:122-126`

**Issue:** The `onError` callback in `handleConfirm` is empty (comment says "keep modal open; user can retry or close"). No error feedback is shown to the user — the modal stays open but appears identical to the pre-attempt state. The user cannot tell whether the operation failed or is still in progress. The loading spinner clears once the mutation settles, leaving the user confused.

**Fix:** Display a notification or an inline error message inside the modal:

```tsx
onError: () => {
  notifications.show({
    color: 'red',
    title: 'Erro',
    message:
      confirmAction?.type === 'reject'
        ? 'Nao foi possivel recusar a cobranca. Tente novamente.'
        : 'Nao foi possivel cancelar a cobranca. Tente novamente.',
    autoClose: 4000,
  })
},
```

---

### WR-03: Partner name derived from account name — will show account name, not person name

**File:** `frontend/src/routes/_authenticated.charges.tsx:65-75`

**Issue:** `connectionPartnerMap` maps `connection_id → account.name`. Account names are user-defined strings like "Nubank" or "Carteira", not the partner's personal name. When displayed in `ChargeCard` and `AcceptChargeDrawer` as `partnerName`, the user sees the account name ("Nubank cobrou voce") rather than the partner's name ("Ana cobrou voce"). The `CreateChargeDrawer` has the same issue at line 63-66 where connection options are labelled `Conexao ${conn.id}` (see IN-01).

**Fix:** The `Charge` domain object (`types/charges.ts`) does not expose the partner's display name. The correct fix is to either:
1. Include `charger_name` / `payer_name` in the `Charge` API response (backend change), or
2. Cross-reference `charger_user_id` / `payer_user_id` against a user-info endpoint.

As a short-term improvement, expose the partner name from the `UserConnection` type on the accounts response and use it instead of `account.name`.

---

### WR-04: `MonthPickerInput` receives both `value` and `defaultValue` simultaneously

**File:** `frontend/src/components/charges/CreateChargeDrawer.tsx:191-205`

**Issue:** The `MonthPickerInput` for the period field (line 191) is rendered in controlled mode via `value={new Date(watchedYear, field.value - 1, 1)}` but also receives `defaultValue={defaultPeriod}`. Passing both `value` and `defaultValue` to a controlled Mantine input is incorrect — `defaultValue` is only meaningful for uncontrolled inputs. Mantine may log a warning in development and behaviour is undefined if the two values differ on first render.

**Fix:** Remove the `defaultValue` prop, since the field is fully controlled through `form.watch`:

```tsx
<MonthPickerInput
  label="Periodo"
  placeholder="Selecione o mes"
  value={new Date(watchedYear, field.value - 1, 1)}
  onChange={(date) => {
    if (date) {
      form.setValue('period_month', date.getMonth() + 1)
      form.setValue('period_year', date.getFullYear())
    }
  }}
  error={fieldState.error?.message}
  // defaultValue removed
/>
```

---

### WR-05: Timezone-unsafe ISO string split in `PeriodNavigator.handleChange`

**File:** `frontend/src/components/transactions/PeriodNavigator.tsx:35`

**Issue:** The comment acknowledges a UTC→local timezone concern, but the fix applied — splitting the ISO string `"2011-02-01T00:00:00.000Z"` on `'-'` — is fragile. `MonthPickerInput` does not guarantee it always returns a UTC midnight `Date`; when `date.toISOString()` is called on a local-midnight `Date` in timezones behind UTC (e.g. UTC-3), the resulting string is `"2011-01-31T21:00:00.000Z"`, which splits into month `01` (January) instead of `02` (February), causing a one-month-back navigation bug for users west of UTC.

**Fix:** Use `getFullYear()` / `getMonth()` directly without converting to ISO first, and handle the UTC offset explicitly:

```tsx
function handleChange(date: DateValue) {
  if (!date) return
  // Interpret as local date to avoid UTC offset shifting the month
  onPeriodChange(date.getMonth() + 1, date.getFullYear())
}
```

---

## Info

### IN-01: Connection options labelled with raw ID instead of partner name

**File:** `frontend/src/components/charges/CreateChargeDrawer.tsx:63-66`

**Issue:** When the user has more than one accepted connection, the `Select` dropdown displays `"Conexao 42"` (using the numeric connection ID). This is not a user-friendly label. The label should show the partner's name or the connection nickname if available.

**Fix:** Use whatever partner name information is accessible from `acc.user_connection` (e.g. a `partner_name` field if exposed by the backend) rather than the raw ID.

---

### IN-02: `fetchCharges` error message does not distinguish HTTP status codes

**File:** `frontend/src/api/charges.ts:11`

**Issue:** On a non-OK response, `fetchCharges` throws a plain `new Error('Failed to fetch charges')`. `fetchChargesPendingCount` does the same (line 18). Unlike `createCharge`, `acceptCharge`, `rejectCharge`, and `cancelCharge` — which throw `res` (the `Response` object) so callers can inspect status and parse the body — the read functions discard all server-side error detail. This inconsistency makes it impossible to show the actual API error to the user in query error handlers.

**Fix:** Throw the response object consistently so callers can parse it:

```ts
if (!res.ok) throw res
```

---

### IN-03: `Direction` type defined but `FetchParams.direction` is never populated by the UI

**File:** `frontend/src/types/charges.ts:3` and `frontend/src/api/charges.ts:9`

**Issue:** `Charges.Direction` (`'sent' | 'received'`) and the corresponding `direction` query param are defined and wired into `fetchCharges`, but the charges page uses client-side filtering (splitting the full list by `payer_user_id` / `charger_user_id`) rather than passing `direction` to the API. The type and the API parameter are unused dead code paths.

**Fix:** Either use the `direction` param in the API call for server-side filtering (and remove the client-side `useMemo` splits), or remove `Direction` and the `direction` param from the type and API until they are needed.

---

### IN-04: `Charge` type is missing an `amount` field

**File:** `frontend/src/types/charges.ts:5-19`

**Issue:** The `Charge` interface does not include an `amount` field. `ChargeCard` receives `balanceAmount` as a separate prop computed from a balance query — it is not sourced from the charge itself. If the backend `Charge` response includes a stored charge amount (distinct from the running balance), it is not modelled in the frontend type, so it cannot be displayed on the card without an additional query.

**Fix:** Verify what the backend `GET /api/charges` response includes. If a charge-level `amount` field exists, add it to the `Charge` interface:

```ts
export interface Charge {
  // ...existing fields...
  amount: number | null  // in cents, null if not set at creation time
}
```

---

_Reviewed: 2026-04-16T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
