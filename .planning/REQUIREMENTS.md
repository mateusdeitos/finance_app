# Requirements: Couples Finance App — v1.7 Transaction Templates

**Defined:** 2026-06-07
**Core Value:** Partners can accurately track shared finances, including in-progress installment purchases, without losing history or requiring manual workarounds.
**Milestone goal:** Let users save personal, reusable transaction templates (type, account, category, tags, split, description prefilled — never an amount) and apply them via quick chips in the transaction form, so repetitive entries only require typing the amount.

## Milestone v1.7 Requirements

Requirements for this milestone. Each maps to exactly one roadmap phase.

### Template CRUD (TMPL)

- [x] **TMPL-01**: User can create a personal transaction template that captures type, account, category, tags, description, and split configuration — but never an amount or a date
- [x] **TMPL-02**: User can view a list of their own templates
- [x] **TMPL-03**: User can edit a template's saved fields
- [x] **TMPL-04**: User can delete a template
- [x] **TMPL-05**: System persists the split configuration faithfully — preserving whether each row was percentage or fixed-amount — so applying a template reproduces the original split input

### Template Application (APPLY)

- [x] **APPLY-01**: User sees a row of template chips at the top of the transaction form, styled like the existing date quick-chips
- [x] **APPLY-02**: Clicking a template chip fills the form from the template, leaves the amount field blank, and moves focus to the amount field
- [x] **APPLY-03**: A template's saved split is prefilled on apply and remains editable before submit
- [x] **APPLY-04**: User can apply a template even if a referenced account, category, or tag was deleted — the stale field is cleared and all other fields are preserved (no error or crash)

### Template Management (MNG)

- [x] **MNG-01**: User can open a dedicated management surface (drawer/screen) to create, edit, and delete templates
- [x] **MNG-02**: User can save the current transaction form's values as a new template via a "Save as template" action
- [x] **MNG-03**: The template editor presents the split configuration sensibly with no amount present (no misleading "R$0,00" live display)

### Safety & Limits (SAFE)

- [x] **SAFE-01**: System caps templates at 3 per user and rejects creating a 4th with a clear, race-safe error
- [x] **SAFE-02**: Templates are private to their owner — another user cannot read, edit, or delete them (404 on owner mismatch, not 403)

## Future Requirements

Deferred to a later milestone. Tracked but not in the current roadmap.

### Templates (future)

- **TMPL-F1**: Shared / connection-wide templates (both partners see the same set)
- **TMPL-F2**: Reordering templates / custom chip order (v1.7 is deterministic creation-order)
- **TMPL-F3**: Recurrence/installment settings saved on a template
- **TMPL-F4**: Raise or remove the 3-template cap once the chip-row UX is validated
- **TMPL-F5**: Apply a template to bulk-create many transactions at once

## Out of Scope

Explicitly excluded for v1.7. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Shared / connection-wide templates | v1.7 templates are personal (per user) only |
| Storing an amount or date on a template | Amount is always blank on apply; date defaults to today at apply time |
| Unlimited templates | Capped at 3 per user for v1.7 to keep the chip row and UI simple |
| Recurrence / installment settings on templates | Templates seed a single transaction's base fields, not a recurring series |
| Bulk-create from a template | Apply prefills one form; bulk creation is out of scope |
| `is_template` column on `transactions` | Rejected for a dedicated table to isolate templates from all financial query paths |

## Traceability

Which phases cover which requirements. Populated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| TMPL-01 | Phase 26 | Complete (26-01) |
| TMPL-02 | Phase 27 | Complete (27-04) |
| TMPL-03 | Phase 27 | Complete (27-04) |
| TMPL-04 | Phase 27 | Complete (27-04) |
| TMPL-05 | Phase 26 | Complete (26-01) |
| APPLY-01 | Phase 29 | Complete (29-02) |
| APPLY-02 | Phase 29 | Complete (29-02) |
| APPLY-03 | Phase 29 | Complete (29-02) |
| APPLY-04 | Phase 29 | Complete (29-02) |
| MNG-01 | Phase 30 | Complete (30-02) |
| MNG-02 | Phase 30 | Complete (30-03) |
| MNG-03 | Phase 28 | Complete (28-01) |
| SAFE-01 | Phase 27 | Complete (27-04) |
| SAFE-02 | Phase 27 | Complete (27-04) |

**Coverage:**
- v1.7 requirements: 14 total
- Mapped to phases: 14 (100%)
- Unmapped: 0

---
*Requirements defined: 2026-06-07 · Traceability populated: 2026-06-08*
