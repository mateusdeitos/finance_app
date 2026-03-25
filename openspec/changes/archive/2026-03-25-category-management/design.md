## Context

Categories already exist in the data model as a self-referencing tree (`parent_id`). The backend has Create, Search, Update, and Delete endpoints. The service already builds a tree in `Search`. The frontend has a `fetchCategories` API call but no management UI.

Current gaps:
- No `emoji` field on categories
- `Delete` endpoint has no migration support (does not null-out or reassign transaction `category_id`)
- No sibling-name uniqueness validation
- No frontend management page

## Goals / Non-Goals

**Goals:**
- Add `emoji` field to category domain, entity, migration
- Extend `DELETE /api/categories/:id` to accept optional `replace_with_id`, handling bulk reassignment or nullification of affected transactions in a single DB transaction
- Add sibling-name uniqueness validation (trimmed) on Create and Update
- Build a `/categories` frontend page with a tree-structured list, emoji display, inline edit, and delete-with-migration dialog

**Non-Goals:**
- Drag-and-drop category reordering
- Moving a category to a different parent (changing `parent_id`) via the management UI
- Pagination of categories (counts are expected to remain small)
- Multi-level children beyond what the existing tree already supports

## Decisions

### 1. Emoji stored as a plain string field

**Decision**: Add `emoji` as a nullable `VARCHAR` column on the `categories` table.

**Rationale**: Emoji are single Unicode grapheme clusters stored as UTF-8 strings. A dedicated column is simple, avoids overloading `name`, and is easy to validate on the frontend (single character / emoji picker).

**Alternative considered**: Embedding the emoji in the name (e.g., "🍕 Food") — rejected because it complicates trimming, sorting, and display logic.

### 2. Delete migration via request body

**Decision**: `DELETE /api/categories/:id` accepts an optional JSON body `{ "replace_with_id": <int> }`.

**Rationale**: REST purists avoid bodies on DELETE, but Echo and standard HTTP clients support it. The alternative (a dedicated `POST /api/categories/:id/migrate`) adds an extra round-trip with no real benefit. Using a query param leaks IDs into server logs.

**Alternative considered**: Two-step API (migrate then delete) — rejected because it opens a window where the category is orphaned.

### 3. Sibling uniqueness validated in the service layer

**Decision**: Before Create/Update, query siblings (same `parent_id`, same `user_id`) and compare trimmed names case-insensitively.

**Rationale**: A DB unique constraint on `(user_id, parent_id, LOWER(TRIM(name)))` would be ideal but requires a migration with a functional index (PostgreSQL supports it, but adds migration complexity). Service-layer validation is sufficient for the expected concurrency level and makes error messages easy to translate.

**Alternative considered**: DB unique constraint — deferred as a future improvement.

### 4. Transaction nullification/reassignment in a DB transaction

**Decision**: `Delete` service method wraps the reassignment (or nullification) and the category delete in a single `dbTransaction.Begin/Commit`.

**Rationale**: Ensures no partial state where a category is deleted but transactions still reference it (or vice versa).

### 5. Frontend tree rendered recursively

**Decision**: A `CategoryTree` component renders a list of root categories; each `CategoryCard` recursively renders its children with indentation.

**Rationale**: The existing `Search` endpoint already returns a tree structure (root nodes with nested `children`). A recursive component maps 1:1 to this shape.

## Risks / Trade-offs

- **Sibling check race condition** → Two concurrent creates with the same name could both pass the service check before either commits. Acceptable for now given single-user + partner usage; a DB constraint can be added later.
- **Large transaction bulk-update** → Reassigning all transactions on delete is a full-table scan on `transactions.category_id`. Acceptable for personal finance scale; add an index on `category_id` if needed.
- **Emoji validation is frontend-only** → Backend stores whatever string is provided. A malicious client could store arbitrary text. Low risk for a personal app; add a regex constraint if needed.

## Migration Plan

1. Create Goose migration: `ALTER TABLE categories ADD COLUMN emoji VARCHAR(10)` (nullable, no default)
2. Add `emoji` to entity, domain, and `ToDomain`/`FromDomain`
3. Update service `Delete` signature and implementation
4. Update repository: add `BulkUpdateCategoryID` method on `TransactionRepository` (or use raw update)
5. Add sibling uniqueness check in `Create` and `Update`
6. Regenerate mocks (`just generate-mocks`)
7. Frontend: add `emoji` to `Category` type, extend API client, build management page

Rollback: the migration is additive (nullable column); rollback drops the column without data loss to existing rows.
