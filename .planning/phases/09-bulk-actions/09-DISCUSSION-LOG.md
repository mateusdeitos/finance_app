# Phase 9: Bulk Actions - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-17
**Phase:** 09-bulk-actions
**Areas discussed:** Toolbar layout, Progress drawer, Action flow UX

---

## Toolbar Layout

| Option | Description | Selected |
|--------|-------------|----------|
| Action buttons row | Add 'Categoria' and 'Data' buttons next to 'Excluir'. Compact but crowded on mobile. | |
| Menu dropdown | Replace single Excluir with 'Ações' menu: Alterar categoria, Alterar data, Excluir. Cleaner, one extra tap. | ✓ |
| Icon buttons | Icon-only buttons for compact mobile layout. Labels on desktop. | |

**User's choice:** Menu dropdown
**Notes:** None

---

## Progress Drawer

| Option | Description | Selected |
|--------|-------------|----------|
| Generalize existing | Refactor BulkDeleteProgressDrawer into generic BulkProgressDrawer that accepts action fn. Both delete and update use it. | ✓ |
| New component | Create BulkUpdateProgressDrawer as separate component. Copy pattern, change labels. | |
| You decide | Claude picks based on code complexity and reuse potential. | |

**User's choice:** Generalize existing
**Notes:** None

---

## Action Flow UX

| Option | Description | Selected |
|--------|-------------|----------|
| Drawer with picker | Bottom drawer with category select + 'Aplicar' button. Same pattern as other drawers. | |
| Inline popover | Popover/dropdown from menu item. Quicker but less consistent. | |
| Two-step menu | Menu replaces items with category list. Compact but unusual. | |

**User's choice:** Custom (free text)
**Notes:** Category: reuse CreateCategoryDrawer from import page in read-only mode (selection only). Date: bottom drawer with DateInput (from transaction form) + "Aplicar" button. Fix bottom drawer content centering — center content, keep drawer full width.

---

## Claude's Discretion

- Component naming and file organization for generalized BulkProgressDrawer
- Whether to use readonly prop or separate SelectCategoryDrawer component
- DateInput styling within bottom drawer

## Deferred Ideas

None
