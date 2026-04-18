# Requirements: Couples Finance App — v1.3

**Defined:** 2026-04-18
**Core Value:** Partners can accurately track shared finances, including in-progress installment purchases, without losing history or requiring manual workarounds.

## v1.3 Requirements

Requirements for editing linked transactions with restricted fields.

### Validation

- [ ] **VAL-01**: Backend rejects edits to non-allowed fields (amount, account, type, recurrence, split) on linked transactions
- [ ] **VAL-02**: Backend allows edits to date, description, category on linked transactions

### Propagation

- [ ] **PROP-01**: Linked transaction date/description/category edits respect propagation settings (all/current/current_and_future) — reusing existing date diff logic

### Frontend

- [ ] **FE-01**: Non-editable fields (amount, account, etc.) shown as disabled when editing linked transaction
- [ ] **FE-02**: Type selector hidden when editing linked transaction
- [ ] **FE-03**: Recurrence toggle hidden when editing linked transaction
- [ ] **FE-04**: Split settings section hidden when editing linked transaction
- [ ] **FE-05**: Propagation settings shown when linked transaction has recurrences

## Future Requirements

None — scope is tightly defined for this milestone.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Editing amount on linked transactions | Would require recalculating both sides of transfer — complex, not needed |
| Editing account on linked transactions | Would fundamentally change the transfer — create new transfer instead |
| Editing split settings on linked transactions | Split is set at creation time |
| Creating new linked transactions from edit form | Out of scope — use create flow |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| VAL-01 | Phase 11 | Done |
| VAL-02 | Phase 11 | Done |
| PROP-01 | Phase 11 | Done |
| FE-01 | Phase 12 | Pending |
| FE-02 | Phase 12 | Pending |
| FE-03 | Phase 12 | Pending |
| FE-04 | Phase 12 | Pending |
| FE-05 | Phase 12 | Pending |

**Coverage:**
- v1.3 requirements: 8 total
- Mapped to phases: 8
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-18*
*Last updated: 2026-04-18 after roadmap creation*
