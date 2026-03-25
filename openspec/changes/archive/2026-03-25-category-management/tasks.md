## 1. Database & Domain

- [x] 1.1 Create Goose migration: `ALTER TABLE categories ADD COLUMN emoji VARCHAR(10)` (nullable)
- [x] 1.2 Add `Emoji *string` field to `domain.Category` and `entity.Category`
- [x] 1.3 Update `entity.Category.ToDomain()` and `CategoryFromDomain()` to map the `emoji` field

## 2. Repository

- [x] 2.1 Add `NullifyCategory(ctx context.Context, categoryID int) error` to `TransactionRepository` interface and implementation (sets `category_id = NULL` where `category_id = ?`)
- [x] 2.2 Add `ReassignCategory(ctx context.Context, fromID, toID int) error` to `TransactionRepository` interface and implementation (sets `category_id = toID` where `category_id = fromID`)
- [x] 2.3 Regenerate mocks: `just generate-mocks`

## 3. Service — Validation & Delete

- [x] 3.1 Add sibling uniqueness check (trimmed, case-insensitive) in `categoryService.Create`
- [x] 3.2 Add sibling uniqueness check (trimmed, case-insensitive) in `categoryService.Update`
- [x] 3.3 Add `DeleteRequest` struct to domain: `{ ReplaceWithID *int }`
- [x] 3.4 Update `CategoryService` interface: change `Delete(ctx, userID, id int)` to `Delete(ctx, userID, id int, req domain.DeleteCategoryRequest) error`
- [x] 3.5 Implement new `Delete` logic: validate `replace_with_id` (not same as `id`, must exist if provided), wrap reassignment/nullification + delete in a DB transaction

## 4. Handler

- [x] 4.1 Update `CategoryHandler.Delete` to bind optional JSON body `{ "replace_with_id": int }` and pass it to the service
- [x] 4.2 Update Swagger annotations on Delete endpoint to document optional body

## 5. Frontend — Types & API

- [x] 5.1 Add `emoji?: string` to `Transactions.Category` type
- [x] 5.2 Add `createCategory`, `updateCategory`, `deleteCategory` functions to `src/api/categories.ts`
  - `deleteCategory(id, replaceWithId?: number)` sends optional body `{ replace_with_id }`

## 6. Frontend — Categories Page

- [x] 6.1 Create `src/routes/_authenticated.categories.tsx` route
- [x] 6.2 Add "Categories" entry to `AppLayout.tsx` navigation
- [x] 6.3 Create `src/components/categories/CategoryCard.tsx` — displays emoji + name, edit/delete actions, recursively renders children with indentation
- [x] 6.4 Create `src/components/categories/CategoryForm.tsx` — form with name input and emoji picker (or text input for emoji), used for create and edit
- [x] 6.5 Create `src/components/categories/DeleteCategoryDialog.tsx` — confirmation dialog with optional replacement category dropdown (excludes the category being deleted)
- [x] 6.6 Create `src/hooks/useCategories.ts` — React Query hook for fetching, creating, updating, deleting categories
- [x] 6.7 Wire up create flow: floating action button opens `CategoryForm` in a drawer/dialog
- [x] 6.8 Wire up edit flow: clicking edit on `CategoryCard` opens `CategoryForm` pre-filled
- [x] 6.9 Wire up delete flow: clicking delete on `CategoryCard` opens `DeleteCategoryDialog`
- [x] 6.10 Display translated backend validation errors (duplicate name, invalid replacement) in the form/dialog

## 7. Validation & Error Messages

- [x] 7.1 Define error codes/messages in `pkg/errors` (or inline) for: `DUPLICATE_CATEGORY_NAME`, `INVALID_REPLACEMENT_CATEGORY`
- [x] 7.2 Ensure frontend maps these error codes/messages to user-friendly translated strings
