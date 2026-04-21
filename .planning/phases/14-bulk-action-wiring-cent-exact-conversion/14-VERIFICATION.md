---
phase: 14-bulk-action-wiring-cent-exact-conversion
verified: 2026-04-20T00:00:00Z
status: human_needed
score: 6/6 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Open the transactions page with 1+ transactions selected and exactly 1 accepted connected account. Open the bulk actions menu."
    expected: "Divisão menu item is enabled, clicking it opens BulkDivisionDrawer, submitting applies split_settings to all selected non-transfer transactions via the BulkProgressDrawer progress UI."
    why_human: "renderDrawer promise chain (BulkDivisionDrawer -> optional PropagationSettingsDrawer -> BulkProgressDrawer) requires a running browser; automated grep/build cannot verify sequential modal flow or actual API call payload."
  - test: "Open the transactions page with no accepted connected accounts (0 accepted connections). Open the bulk actions menu."
    expected: "Divisão menu item is visibly disabled. A Portuguese hint 'Conecte uma conta para usar esta ação.' appears below it. Clicking the item does nothing."
    why_human: "Disabled state rendering and touch/click no-op behaviour require a browser; the conditional rendering is in place but visual correctness cannot be confirmed programmatically."
  - test: "Select a mixed set of transactions including at least one transfer and at least two expense/income transactions. Trigger Divisão bulk action."
    expected: "The progress drawer shows only the expense/income transactions; the transfer is silently absent from the list and no error row appears for it."
    why_human: "The getDivisionEligibleIds filter is implemented but its runtime behaviour across a real selection requires manual observation."
---

# Phase 14: Bulk Action Wiring & Cent-Exact Conversion Verification Report

**Phase Goal:** The "Divisão" bulk action is fully wired into `SelectionActionBar` and, on submit, converts percentages into cents per-transaction (last split absorbs the rounding remainder) before sequentially applying the update to each selected transaction via the existing progress drawer
**Verified:** 2026-04-20
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A "Divisão" menu item appears in SelectionActionBar immediately before the Menu.Divider that precedes "Excluir" | VERIFIED | `awk` ordering check: btn_bulk_division line (63) < Menu.Divider line (72) < btn_bulk_delete line (76); exit 0 confirmed |
| 2 | When the user has zero connected accounts, the "Divisão" menu item is disabled and explains that a connected account is required | VERIFIED | `disabled={connectedAccountsCount === 0}` on Menu.Item; conditional `<Text>` with "Conecte uma conta para usar esta ação." at line 67–71 |
| 3 | On submit, each selected transaction's split_settings amounts sum exactly to tx.amount with the last split absorbing the rounding remainder | VERIFIED | `splitPercentagesToCents` uses `Math.round((amount * pct) / 100)` for non-last entries; last entry computes `amount - runningSum`; output carries only `{connection_id, amount}` (no `percentage`) |
| 4 | Outgoing split_settings on PUT carries only connection_id and amount (never percentage) | VERIFIED | Both `result.push` calls in splitMath.ts omit `percentage`; awk scan of `handleDivisionClick` body finds zero non-comment `percentage` token references |
| 5 | Each PUT carries the full existing transaction payload via the existing buildFullPayload helper | VERIFIED | `buildFullPayload(tx, { split_settings: perTxSplits })` at line 341; `buildFullPayload` constructs the full payload including type, account_id, amount, date, description, tags, recurrence_settings with the override spread at the end |
| 6 | The existing BulkProgressDrawer drives sequential per-transaction progress; transfers and linked transactions the user does not own are silently skipped; income transactions are processed normally | VERIFIED | `getDivisionEligibleIds()` extends `getEligibleIds()` (original_user_id check) to also exclude `tx.type !== 'transfer'`; no income type guard in handler; `testIdPrefix="bulk_division"` confirmed; `BulkProgressDrawer` import and JSX usage confirmed |

**Score:** 6/6 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `frontend/src/utils/splitMath.ts` | Pure cent-exact percentage→amount helper `splitPercentagesToCents(amount, splits)` | VERIFIED | File exists, 47 lines, exports `splitPercentagesToCents`, uses `Math.round`, last-absorbs-remainder, no React/fetch imports, only `Transactions` type import |
| `frontend/src/components/transactions/SelectionActionBar.tsx` | Divisão menu item + `onDivisaoChange`/`connectedAccountsCount` props + disabled state | VERIFIED | Both new props in interface and destructuring; `IconShare` imported; `btn_bulk_division` testid; disabled + hint when count=0; existing 3 items unchanged |
| `frontend/src/routes/_authenticated.transactions.tsx` | `handleDivisionClick` handler + SelectionActionBar wiring + `connectedAccountsCount` computation | VERIFIED | All three present; `connectedAccountsCount` filters by `connection_status === 'accepted'`; both mobile and desktop `<SelectionActionBar>` call sites receive new props |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `_authenticated.transactions.tsx` | `BulkDivisionDrawer.tsx` | `renderDrawer<Transactions.SplitSetting[]>(() => <BulkDivisionDrawer />)` | WIRED | Import at line 25; JSX usage at line 311 inside `handleDivisionClick` |
| `_authenticated.transactions.tsx` | `splitMath.ts` | `splitPercentagesToCents(tx.amount, rawSplits)` inside BulkProgressDrawer action | WIRED | Import at line 30; call at line 340 |
| `_authenticated.transactions.tsx` | `api/transactions.ts` | `updateTransaction(item.id, buildFullPayload(tx, { split_settings: perTxSplits }))` | WIRED | `buildFullPayload` call at line 341; `updateTransaction` call at line 345 |
| `SelectionActionBar.tsx` | `_authenticated.transactions.tsx` | `onDivisaoChange` prop wired to `handleDivisionClick` | WIRED | Both `<SelectionActionBar>` call sites (mobile line 428, desktop line 515) have `onDivisaoChange={handleDivisionClick}` — count check returns 2 |

### Data-Flow Trace (Level 4)

Not applicable for this phase. `splitMath.ts` is a pure computation utility with no data fetching. `SelectionActionBar.tsx` is a presentational component receiving all data via props. The route file drives data flow from existing `useAccounts` and `useTransactions` hooks (already established in prior phases) — no new data sources introduced.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| splitMath pure helper (no React/fetch) | `grep -E 'fetch\|useState\|from "react"' splitMath.ts` | No output | PASS |
| splitMath exports splitPercentagesToCents | `grep "export function splitPercentagesToCents" splitMath.ts` | Found | PASS |
| Output objects omit percentage field | `grep "result.push" splitMath.ts` | Both pushes contain only `connection_id` and `amount` | PASS |
| Both SelectionActionBar call sites wired | `grep -c "onDivisaoChange={handleDivisionClick}" ...transactions.tsx` | 2 | PASS |
| Menu ordering (btn_bulk_division -> Divider -> btn_bulk_delete) | `awk` ordering check | exit 0 | PASS |
| No income guard in handleDivisionClick | `! grep "type === 'income'" ...transactions.tsx` | No match | PASS |
| Transfer skip filter present | `grep "getDivisionEligibleIds\|type !== 'transfer'"` | Found both | PASS |
| Frontend build | `cd frontend && npm run build` | exit 0 in 3.91s | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| UI-01 | 14-01-PLAN.md | "Divisão" menu item in SelectionActionBar before Menu.Divider that precedes "Excluir" | SATISFIED | `data-testid="btn_bulk_division"` at SelectionActionBar.tsx:63; awk ordering confirmed |
| UI-02 | 14-01-PLAN.md | Disabled with Portuguese message when 0 connected accounts | SATISFIED | `disabled={connectedAccountsCount === 0}` at line 62; `<Text>` hint "Conecte uma conta..." at lines 67–70 |
| PAY-01 | 14-01-PLAN.md | Cent-exact conversion: `round(tx.amount * pct / 100)`, last absorbs remainder | SATISFIED | `Math.round((amount * pct) / 100)` at splitMath.ts:37; `amount - runningSum` at line 44 |
| PAY-02 | 14-01-PLAN.md | Outgoing split_settings contains only `connection_id` and `amount` — no `percentage` | SATISFIED | Both `result.push` calls in splitMath.ts include only `connection_id` and `amount`; zero non-comment `percentage` tokens in `handleDivisionClick` body |
| PAY-03 | 14-01-PLAN.md | PUT carries full transaction payload via `buildFullPayload` | SATISFIED | `buildFullPayload(tx, { split_settings: perTxSplits })` at transactions.tsx:341; `buildFullPayload` constructs complete payload with spread-override |
| BULK-01 | 14-01-PLAN.md | Sequential per-tx progress via existing BulkProgressDrawer, `testIdPrefix="bulk_division"` | SATISFIED | `BulkProgressDrawer` rendered with `testIdPrefix="bulk_division"` at transactions.tsx:357 |
| BULK-02 | 14-01-PLAN.md | Transfers and linked-non-owned transactions silently skipped | SATISFIED | `getDivisionEligibleIds()` chains `getEligibleIds()` (original_user_id filter) then `tx?.type !== 'transfer'` filter |
| BULK-03 | 14-01-PLAN.md | Income transactions processed normally (no special-case exclusion) | SATISFIED | No `type === 'income'` guard in `handleDivisionClick` or `getDivisionEligibleIds` |

**Notes on requirements NOT assigned to Phase 14:**
- UI-03, UI-04, FORM-01, FORM-02, FORM-03 — assigned to Phase 13 (BulkDivisionDrawer form, verified in Phase 13)
- TEST-01, TEST-02 — assigned to Phase 15 (Playwright e2e and unit rounding tests, not yet implemented)

No orphaned requirements: all 8 Phase 14 requirements are fully accounted for.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None found | — | — | — | — |

No TODO/FIXME/HACK comments, no placeholder returns, no empty handlers, no hardcoded empty arrays flowing to render, no `percentage` appearing in handler output path.

### Human Verification Required

#### 1. Full Divisão bulk action flow (happy path)

**Test:** Open the app, navigate to Transactions. Ensure at least one account has an accepted user_connection. Select 2+ expense or income transactions. Open the "Ações" menu. Click "Divisão".
**Expected:** BulkDivisionDrawer opens. After submitting a valid split (summing to 100%), the BulkProgressDrawer appears and sequentially updates each selected transaction. On success, selection is cleared and the transactions list refreshes with the new splits.
**Why human:** The full renderDrawer promise chain (input drawer → optional propagation drawer → progress drawer) requires a live React tree with browser rendering. The actual API payload shape (confirming no `percentage` on the wire) requires network inspection.

#### 2. Disabled state with 0 connected accounts

**Test:** Ensure the logged-in user has no accepted user connections. Navigate to Transactions. Select any transaction. Open the "Ações" menu.
**Expected:** "Divisão" item is visually disabled (greyed out, not clickable). The hint "Conecte uma conta para usar esta ação." is visible beneath it. Clicking/tapping the item does nothing.
**Why human:** Mantine's `disabled` prop rendering, touch/click no-op behaviour, and visual hint readability require a browser.

#### 3. Transfer silent-skip in mixed selection

**Test:** Select a set of transactions that includes at least 1 transfer and at least 2 non-transfer transactions. Trigger the Divisão action and submit a split configuration.
**Expected:** The BulkProgressDrawer shows only the non-transfer transactions in its item list. No error row appears for the transfer. The transfer's split_settings remain unchanged after the operation.
**Why human:** Runtime filtering behaviour of `getDivisionEligibleIds` across a real mixed selection needs manual observation.

### Gaps Summary

No gaps. All 6 must-have truths are VERIFIED, all 3 artifacts exist and are substantively implemented and wired, all 4 key links are confirmed, all 8 requirements are SATISFIED, and the frontend build passes. The 3 human verification items above are behavioural/UX checks that cannot be confirmed programmatically — these are the only reason status is `human_needed` rather than `passed`.

Phase 15 will provide Playwright e2e coverage (TEST-01) and cent-exact unit tests (TEST-02) that will automate the core scenarios above.

---

_Verified: 2026-04-20_
_Verifier: Claude (gsd-verifier)_
