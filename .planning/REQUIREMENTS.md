# Requirements: Transactions Bulk Actions

**Defined:** 2026-04-17
**Core Value:** Partners can accurately track shared finances, including in-progress installment purchases, without losing history or requiring manual workarounds.

## v1.2 Requirements

Requirements for milestone v1.2. Each maps to roadmap phases.

### Selection

- [ ] **SEL-01**: User can select transactions via existing checkbox multi-select
- [ ] **SEL-02**: Linked transactions where user ≠ original_user_id are silently excluded from bulk actions

### Bulk Actions Toolbar

- [ ] **BAR-01**: User sees category change action in selection action bar when transactions selected
- [ ] **BAR-02**: User sees date change action in selection action bar when transactions selected
- [ ] **BAR-03**: User can pick a category from toolbar before applying bulk change
- [ ] **BAR-04**: User can pick a date from toolbar before applying bulk change

### Propagation

- [ ] **PROP-01**: User sees propagation settings drawer when any selected transaction has recurrence, before bulk action executes
- [ ] **PROP-02**: Single propagation choice applies to all installment transactions in batch

### Progress & Completion

- [ ] **PROG-01**: User sees progress drawer with per-transaction status during bulk update
- [ ] **PROG-02**: User sees success state with count of updated transactions on completion
- [ ] **PROG-03**: User sees error state with failed transaction and remaining list if update fails
- [ ] **PROG-04**: Transactions query invalidated on completion

## Future Requirements

None — milestone is self-contained.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Select all toggle | Not in existing implementation, not requested |
| Bulk delete changes | Already works, not part of this milestone |
| Optimistic updates | Financial data — non-optimistic pattern established |
| Backend changes | Backend already supports single-transaction update with propagation |
| Retry on failure | Current pattern stops on first error — consistent with bulk delete |
| Bulk edit of other fields | Only category and date for this milestone |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| SEL-01 | — | Pending |
| SEL-02 | — | Pending |
| BAR-01 | — | Pending |
| BAR-02 | — | Pending |
| BAR-03 | — | Pending |
| BAR-04 | — | Pending |
| PROP-01 | — | Pending |
| PROP-02 | — | Pending |
| PROG-01 | — | Pending |
| PROG-02 | — | Pending |
| PROG-03 | — | Pending |
| PROG-04 | — | Pending |

**Coverage:**
- v1.2 requirements: 12 total
- Mapped to phases: 0
- Unmapped: 12 ⚠️

---
*Requirements defined: 2026-04-17*
*Last updated: 2026-04-17 after initial definition*
