# Requirements: Couples Finance App — v1.4

**Defined:** 2026-04-20
**Source:** Issue #86 — "Permitir ação em massa 'Divisão'"
**Core Value:** Partners can accurately track shared finances, including in-progress installment purchases, without losing history or requiring manual workarounds.

## v1.4 Requirements

Add "Divisão" (split settings) as a bulk action on the transactions list, letting users apply a single percentage-based split configuration to N selected transactions. Backend is unchanged — the existing `PUT /api/transactions/{id}` endpoint already accepts `split_settings`. All conversion (percentage → cents per transaction) happens client-side at submit time.

### UI & Menu Integration

- [x] **UI-01**: "Divisão" menu item appears in `SelectionActionBar` before the `Menu.Divider` that precedes "Excluir"
- [x] **UI-02**: When the user has 0 connected accounts (`user_connection.connection_status === "accepted"` count is 0), the "Divisão" menu item is disabled with a tooltip/message explaining a connected account is required
- [ ] **UI-03**: When the user has exactly 1 connected account, the drawer opens with that account pre-selected in the first split row
- [ ] **UI-04**: When the user has 2+ connected accounts, the drawer opens empty and the user chooses

### Drawer Form

- [ ] **FORM-01**: New `BulkDivisionDrawer.tsx` component renders a React Hook Form with `useFieldArray` for N split rows, each `{ connection_id, percentage }`
- [ ] **FORM-02**: Drawer is **percentage-only** — no toggle for fixed-amount mode
- [ ] **FORM-03**: Form blocks submit until `Σ percentage === 100`

### Payload & Conversion

- [x] **PAY-01**: On submit, for each selected transaction the frontend computes `amount` (cents) per split from the percentage: `round(tx.amount * percentage / 100)`, with the **last split absorbing the rounding remainder** so `Σ split.amount === tx.amount` exactly
- [x] **PAY-02**: Outgoing `split_settings` payload contains **only** `connection_id` and `amount` — never `percentage` (backend returns 400 when both are sent)
- [x] **PAY-03**: `PUT /api/transactions/{id}` carries the **full transaction payload** (not a partial), matching the pattern from commit `19f2bbb` to prevent data loss

### Bulk Execution & Edge Cases

- [x] **BULK-01**: Sequential per-transaction updates are displayed via the existing `BulkProgressDrawer`
- [x] **BULK-02**: Linked transactions (non-null `linked_transaction_id`, or any transaction that cannot accept a split change) are **silently skipped** — no error surfaced in the progress drawer, matching the SEL-02 pattern from v1.2
- [x] **BULK-03**: Income transactions in the selection are handled normally by the bulk split flow (splits on income supported since PR #57)

### Testing

- [x] **TEST-01
**: Playwright e2e — success path with 1 connected account auto-selected and bulk split applied to a multi-transaction selection
- [x] **TEST-02
**: Playwright (or unit) verification that `Σ split.amount === tx.amount` for a representative percentage mix (e.g. 30/70 on an odd-cent amount) — no 1-cent drift

## Future Requirements

None — scope is tightly defined to issue #86.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Backend schema changes or new endpoints | `PUT /api/transactions/{id}` already accepts `split_settings`; no change needed |
| Fixed-amount mode in bulk drawer | Ambiguous across transactions with different amounts; percentage-only avoids the footgun |
| Per-transaction propagation choice in the bulk flow | Single batch choice is consistent with v1.2 bulk patterns; simpler UX |
| Surfacing per-item errors for linked/unsplittable transactions | Silent skip (SEL-02 pattern) — user shouldn't see errors for ops they can't perform |
| Editing linked transactions from bulk flow | Respect PR #71 / PR #85 restrictions; linked txs stay skipped |
| New Settlement semantics | Reuse existing Settlement generation from `transaction_update.go` |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| UI-01 | Phase 14 | Complete |
| UI-02 | Phase 14 | Complete |
| UI-03 | Phase 13 | Pending |
| UI-04 | Phase 13 | Pending |
| FORM-01 | Phase 13 | Pending |
| FORM-02 | Phase 13 | Pending |
| FORM-03 | Phase 13 | Pending |
| PAY-01 | Phase 14 | Complete |
| PAY-02 | Phase 14 | Complete |
| PAY-03 | Phase 14 | Complete |
| BULK-01 | Phase 14 | Complete |
| BULK-02 | Phase 14 | Complete |
| BULK-03 | Phase 14 | Complete |
| TEST-01 | Phase 15 | Pending |
| TEST-02 | Phase 15 | Pending |

**Coverage:**
- v1.4 requirements: 15 total
- Mapped to phases: 15 (Phase 13: 5 · Phase 14: 8 · Phase 15: 2)
- Unmapped: 0

---
*Requirements defined: 2026-04-20*
*Last updated: 2026-04-20 — roadmap created (Phases 13–15)*
