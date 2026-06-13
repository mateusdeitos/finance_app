# Phase 26: Backend Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-13
**Phase:** 26-backend-foundation
**Areas discussed:** Storage model (pivot), Template name, Type scope, Delete semantics, Split modes

---

## Storage model (mid-discussion pivot)

Initially the phase assumed a typed-column table mirroring `transactions` (type, account_id, category_id, destination_account_id, tag_ids, split_settings as separate columns + FKs). User pivoted to a single opaque JSONB `payload` column.

| Option | Description | Selected |
|--------|-------------|----------|
| Typed columns mirroring transactions | One column per field, FKs with ON DELETE SET NULL, CategoryService.Delete extension | |
| Opaque JSONB `payload` | Backend stores the form payload as an opaque blob; validation on apply, silently dropping invalid fields | ✓ |

**User's choice:** "Vamos salvar a template em uma coluna jsonb, isso deixa mais dinâmico, só teremos que validar se o formato bate com o que o front espera, caso não bata, deve ignorar silenciosamente os inválidos na hora de aplicar a template."
**Notes:** Removes per-field columns, FKs, and the CategoryService.Delete/TagService.Delete hooks (CP-8/CP-1 moot). `name` and `user_id` kept relational for UNIQUE + IDOR + cap. Format contract enforced on the frontend at apply.

---

## Template name

| Option | Description | Selected |
|--------|-------------|----------|
| Required + unique per user | `name` NOT NULL, UNIQUE(user_id, name) — clear chip labels | ✓ |
| Required, non-unique | `name` NOT NULL, duplicates allowed | |
| No name column | Derive chip label from description/category | |

**User's choice:** Required + unique per user.
**Notes:** Kept as a real column (not in payload) so uniqueness is a DB constraint. Flagged as flippable into payload (service-level uniqueness) if preferred later.

---

## Type scope

| Option | Description | Selected |
|--------|-------------|----------|
| Expense + income only | Simpler; transfer deferred | |
| All three incl. transfer | Supports transfer (destination_account_id) | ✓ |

**User's choice:** All three including transfer.
**Notes:** Under the opaque-payload model this is free — the payload carries whatever fields the form produces (incl. destination_account_id for transfer); per-type correctness is the frontend's job.

---

## Delete semantics

| Option | Description | Selected |
|--------|-------------|----------|
| Hard delete | No deleted_at; disposable; cap counts trivially | ✓ |
| Soft delete | deleted_at; consistent with domain, must filter from cap + queries | |

**User's choice:** Hard delete.

---

## Split modes

| Option | Description | Selected |
|--------|-------------|----------|
| Percentage only | Scales with typed amount; avoids orphan fixed values | |
| Percentage + fixed amount | Preserves per-row mode faithfully | ✓ |

**User's choice:** Percentage + fixed amount.
**Notes:** Under the opaque payload, both modes are preserved automatically (stored verbatim). TMPL-05 satisfied by passthrough.

## Claude's Discretion

- Opaque-JSONB Go technique (`datatypes.JSON` vs `json.RawMessage` Scan/Value) — follow `entity/user_settings.go`.
- Whether to do minimal create-time JSON sanity vs fully opaque — default minimal/none.
- Migration column ordering, timestamps, indexes beyond `UNIQUE(user_id, name)`.

## Deferred Ideas

- Server-side per-field payload validation — intentionally not done; revisit if a future milestone needs server guarantees.
- Recurrence on templates — out of scope for v1.7.
