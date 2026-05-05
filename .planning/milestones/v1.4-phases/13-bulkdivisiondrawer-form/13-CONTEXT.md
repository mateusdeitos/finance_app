# Phase 13: BulkDivisionDrawer Form - Context

**Gathered:** 2026-04-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the `BulkDivisionDrawer` component: a standalone, percentage-only split-settings drawer that returns the raw split configuration (`[{ connection_id, percentage }]`) to its caller via the `renderDrawer` promise. Smart pre-selection when exactly one connected account exists; empty when 2+ exist. Real-time sum=100% validation and submit gating.

**In scope (this phase):** the drawer UI, the form, validation, pre-selection logic, and the promise resolution contract.

**Out of scope (Phase 14):** menu wiring in `SelectionActionBar`, disabled-state when 0 connected accounts (UI-02), percentage→cents per-transaction conversion (PAY-01), payload shape on the wire (PAY-02/03), sequential progress execution (BULK-01), silent skip of linked transactions (BULK-02), income-tx handling (BULK-03). **Out of scope (Phase 15):** e2e and rounding verification tests.

**Requirements locked to this phase:** UI-03, UI-04, FORM-01, FORM-02, FORM-03.

</domain>

<decisions>
## Implementation Decisions

### Component Strategy

- **D-01:** **Reuse `SplitSettingsFields.tsx` as-is** inside the drawer's `FormProvider`. The existing component already has an `onlyPercentage` prop that hides the fixed-amount toggle. When the parent form has no `amount` field, `useWatch({ name: "amount" })` returns `undefined → 0`, and the `totalAmount > 0 && <Text>= R$ ...</Text>` guard at `SplitSettingsFields.tsx:126` hides the per-row cent preview automatically. No fork, no refactor — reuse clean.
- **D-02:** The drawer owns its own `useForm` + `FormProvider` wrapper. `SplitSettingsFields` is mounted with default `namePrefix=""` and `onlyPercentage={true}`. The form schema shape is `{ split_settings: [{ connection_id: number, percentage: number }] }` — no `amount` field in the form state, by design.

### Validation & UX Feedback

- **D-03:** **Zod resolver** (`@hookform/resolvers/zod`) with a `.refine()` on the `split_settings` array checking `Σ percentage === 100`. Consistent with the project's Zod pattern introduced in v1.0 (recurrence form).
- **D-04:** **Live sum badge** in the drawer body (header or above the submit button) — shows `Total: X% / 100%` with a color state (red when ≠ 100, green when = 100). Submit button stays disabled until the sum is exactly 100.
- **D-05:** Each row also validates `1 ≤ percentage ≤ 100` via Zod; `connection_id > 0` required per row.

### Pre-selection (UI-03 / UI-04)

- **D-06:** When exactly one connected account exists, the form initializes with a single row: `{ connection_id: <the-one-connection-id>, percentage: <connection's default_split_percentage> }`. This mirrors `SplitSettingsFields.tsx:64` (`defaultPercentage = isFrom ? conn.from_default_split_percentage : conn.to_default_split_percentage`). Honors the relationship preference the users already configured.
- **D-07:** When 2+ connected accounts exist, the form initializes with a single empty row (`connection_id: 0, percentage: 0`) — letting the user pick and type explicitly. Matches the "blank first row" behavior of `SplitSettingsFields.tsx:192-211`.
- **D-08:** The existing `SplitSettingsFields` "+ Adicionar divisão" anchor handles adding further rows. The drawer adds no additional row-management UI.

### Drawer Shape

- **D-09:** **Bottom drawer** (`position="bottom"`) with the same styles as `SelectDateDrawer.tsx` / `SelectCategoryDrawer.tsx`: rounded top corners, `height: "auto"`, `maxHeight: "80dvh"`. Consistent with other bulk-action drawers.
- **D-10:** Return shape from `close()`: **raw form values as an array** — `[{ connection_id, percentage }]`. Phase 14 converts percentage → cents per transaction at submit. No wrapper object.
- **D-11:** Cancel behavior: `onClose` calls `reject()` (standard `renderDrawer` pattern) so the caller can `try/catch` the dismissal without treating it as an error — matching `SelectDateDrawer.tsx:13`.
- **D-12:** Title: `"Alterar divisão"` (Portuguese, matching the other bulk drawer titles like "Alterar data", "Alterar categoria").
- **D-13:** Submit button label: `"Aplicar"` — matches `SelectDateDrawer.tsx:41`.

### Claude's Discretion

- Exact copy for the sum badge ("Total: X% / 100%" is a suggestion; Portuguese wording like "Soma: X% / 100%" may be more consistent — planner/implementer decides).
- Exact spacing/layout within the drawer (`Stack gap="md"` likely, but fine to tune).
- `data-testid` values for the drawer and submit button — follow the `bulk_*` / `btn_apply_*` / `drawer_*` naming from existing bulk drawers (e.g. `drawer_bulk_division`, `btn_apply_division`, `input_bulk_division_*`).
- Whether the sum badge is rendered above the row list, below it, or next to the submit button. Keep it visible on mobile without scroll if possible.
- Whether to show a hint/tooltip explaining that the split applies per transaction (percentage of each tx.amount). Not required, but a small note would help first-time users.

### Folded Todos

None — no pending todos matched this phase.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & Spec

- `.planning/REQUIREMENTS.md` — v1.4 requirement IDs UI-03, UI-04, FORM-01, FORM-02, FORM-03 belong to this phase
- `.planning/ROADMAP.md` §"Phase 13: BulkDivisionDrawer Form" — phase goal and success criteria
- GitHub Issue #86 ("Permitir ação em massa 'Divisão'") — canonical source of the feature behavior; see also `https://github.com/mateusdeitos/finance_app/issues/86`

### Code to reuse / mirror

- `frontend/src/components/transactions/form/SplitSettingsFields.tsx` — **REUSE AS-IS** inside the drawer's FormProvider with `onlyPercentage={true}`. Percentage math at line 71, default_split_percentage lookup at line 64, preview-hiding guard at line 126.
- `frontend/src/components/transactions/SelectDateDrawer.tsx` — pattern reference for the drawer shell (bottom drawer, useDrawerContext, close/reject, Aplicar button)
- `frontend/src/components/transactions/SelectCategoryDrawer.tsx` — another bulk-drawer pattern reference
- `frontend/src/utils/renderDrawer.tsx` — MUST be the entry point for opening the drawer (per `frontend/CLAUDE.md` "Drawers" rule)
- `frontend/src/hooks/useAccounts.ts` — source of `accounts` data; filter by `user_connection?.connection_status === "accepted"`
- `frontend/src/hooks/useMe.ts` — source of `currentUserId` used to resolve which side of `user_connection` to read `default_split_percentage` from

### Conventions

- `frontend/CLAUDE.md` — drawers via `renderDrawer` (required), Mantine + CSS Modules, React Hook Form, Zod for validation, mobile-first, `QueryKeys` const for query keys (not used here but noted)
- `CLAUDE.md` (root) — cents as int64 end-to-end (relevant to Phase 14, not this drawer)

### Contracts

- `frontend/src/types/transactions.ts` namespace `Transactions.SplitSetting` / `Transactions.Account` — types the drawer consumes
- Backend: `PUT /api/transactions/{id}` accepting `split_settings` — Phase 14 concern only (drawer does not call the API)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **`SplitSettingsFields`** (`frontend/src/components/transactions/form/SplitSettingsFields.tsx`) — already supports `onlyPercentage` and works via `useFormContext`. With no `amount` field in the parent form, the per-row `= R$ X,XX` preview disappears automatically (`totalAmount > 0` guard at line 126). Drop-in reuse.
- **`SplitRow`** (same file) — dynamic-row UX, account select, remove button, percentage input — all already built.
- **`renderDrawer` + `useDrawerContext`** (`frontend/src/utils/renderDrawer.tsx`) — drawer-as-promise primitive; the drawer must resolve via `close(value)` and reject via `reject()` or drawer dismissal.
- **`useAccounts`** and **`useMe`** — the same hooks `SplitSettingsFields` uses internally; the drawer does not need to wire these itself because the reused component pulls them in.

### Established Patterns

- **Bulk drawer shape:** bottom position, rounded top corners, `maxHeight: "80dvh"`, single "Aplicar" submit (`SelectDateDrawer.tsx`, `SelectCategoryDrawer.tsx`).
- **Form integration:** React Hook Form with Zod resolver when non-trivial validation is needed (see the recurrence form from v1.0).
- **Empty / pre-selected row construction:** `SplitSettingsFields` mounts rows from a field-array; the parent seeds `defaultValues`.
- **Naming:** Portuguese user-facing labels ("Alterar data", "Aplicar"); English code identifiers and test IDs (`data-testid="btn_apply_*"`).

### Integration Points

- **Where the drawer is called from:** the transactions route (`frontend/src/routes/_authenticated.transactions.tsx`) — Phase 14 work. Phase 13 only produces the component.
- **Downstream consumer shape:** Phase 14's handler will call `const result = await renderDrawer<SplitSetting[]>(() => <BulkDivisionDrawer />)` and then, for each selected tx, convert `result[*].percentage` → `result[*].amount` (cents) using `Math.round(tx.amount * pct / 100)` with the last split absorbing the remainder (PAY-01).

</code_context>

<specifics>
## Specific Ideas

- The user explicitly asked to **reuse `SplitSettingsFields` as-is** rather than forking — confirmed that the `totalAmount > 0` guard hides the broken preview cleanly when no `amount` field is in the form.
- The user wants the sum=100 feedback to be **live** (not submit-time), with a badge/indicator in the drawer and a disabled submit button.
- Default percentage on auto-selection is the **connection's stored `default_split_percentage`**, not a hard-coded 50% or 100%.

</specifics>

<deferred>
## Deferred Ideas

- Auto-rebalance on row add/remove (e.g., when a user adds a third row, redistribute to 33/33/33). Considered, rejected as too opinionated for this phase. Could return later as UX polish.
- Whether the drawer should preview a "representative transaction" to show how splits will apply. Rejected because amounts vary per-tx and the per-tx cent math lives in Phase 14. Can be reconsidered if users find the percentage-only UI too abstract.
- Reviewed Todos (not folded): none — no matching backlog todos for Phase 13.

</deferred>

---

*Phase: 13-bulkdivisiondrawer-form*
*Context gathered: 2026-04-20*
