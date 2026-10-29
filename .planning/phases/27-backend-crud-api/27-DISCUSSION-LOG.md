# Phase 27: Backend CRUD API - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-14
**Phase:** 27-backend-crud-api
**Areas discussed:** Payload strictness, Validation depth, Duplicate names, Update semantics

---

## Payload strictness

| Option | Description | Selected |
|--------|-------------|----------|
| Strict — reject (400) | DisallowUnknownFields: unknown keys return 400 with a tag | |
| Lenient — drop unknown | Silently ignore unknown keys; persist only canonical struct fields | ✓ |

**User's choice:** Lenient — drop unknown
**Notes:** Resolves the strictness question P26 D-01b deferred to this phase. Aligns with the apply-time "silent drop" philosophy; `amount`/`date` drop naturally either way.

---

## Validation depth

| Option | Description | Selected |
|--------|-------------|----------|
| Basic field validation | name non-empty (+length), valid type enum, split rows percentage XOR amount; NO existence checks | ✓ |
| Shape-only | Trust the unmarshal; persist whatever parses | |

**User's choice:** Basic field validation
**Notes:** Combined with lenient unmarshal → forgiving on unknown keys, strict on the fields that matter. No cross-row split sum check (templates carry no total amount). Existence checks remain apply-time (frontend).

---

## Duplicate names

| Option | Description | Selected |
|--------|-------------|----------|
| Reject — 409 with tag | Keep UNIQUE(user_id,name); return ALREADY_EXISTS + TEMPLATE.DUPLICATE_NAME | ✓ |
| Allow duplicates | Drop the unique constraint (new migration); allow repeated names | |

**User's choice:** Reject — 409 with tag
**Notes:** Mirrors CATEGORY.DUPLICATE_NAME precedent. Keeps the P26 unique index; no migration.

---

## Update semantics

| Option | Description | Selected |
|--------|-------------|----------|
| PUT — full replace | New name + entire payload overwrite the row; tag replacement trivial (tags in payload) | ✓ |
| PATCH — partial update | Field-presence tracking, partial updates | |

**User's choice:** PUT — full replace
**Notes:** Frontend always sends the complete template. "Tag replacement" is trivial since tag_ids live inside the JSONB payload (no join table, P26 D-07).

---

## Claude's Discretion

- Race-safe cap mechanism (exact SQL: conditional INSERT vs serializable tx vs partial unique index) — roadmap locks "race-safe via conditional INSERT"; researcher/planner picks the technique.
- DTO shape, response envelope, HTTP success codes (201/200/204).
- Unique-violation detection (pre-check SELECT vs DB constraint catch) — must stay race-safe.
- `name` max length, validation tag names/messages, Swagger wording.

## Deferred Ideas

- `GET /:id` single-read endpoint — not needed this phase.
- Server-side existence/referential validation — deferred to apply (frontend, P29).
- Raising/removing the 3-cap, reordering, shared templates — future milestone (TMPL-F1..F5).
