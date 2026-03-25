## Why

Users need a way to manage their transaction categories — currently there is no UI to list, edit, or delete them. Additionally, deleting a category needs careful handling so that existing transactions are not left in an inconsistent state.

## What Changes

- Add a categories management page with a tree-structured list view (parent/child hierarchy)
- Allow users to select an emoji for each category
- Add edit functionality for existing categories (name + emoji)
- Add delete functionality with a migration prompt: users can choose to reassign transactions to another category, or clear the category field on those transactions
- **BREAKING**: Delete category endpoint now accepts an optional `replace_with_id` body field; when omitted, affected transactions have their `category_id` set to `NULL`
- Validate that no two sibling categories share the same trimmed name (enforced on backend for create and update)
- Validate that `replace_with_id` is not the same as the category being deleted, and that it refers to an existing category; return translated error messages for both cases

## Capabilities

### New Capabilities

- `category-management`: Full CRUD UI for categories with tree view, emoji picker, delete-with-migration flow, and sibling name uniqueness validation

### Modified Capabilities

<!-- No existing specs have requirement-level changes -->

## Impact

- **Backend**: `DELETE /api/categories/:id` gets new optional body; new validation on `POST` and `PUT /api/categories`; transaction repository touched to support bulk category reassignment or nullification
- **Frontend**: New `/categories` route and page, `CategoryCard` component, emoji picker integration, delete confirmation dialog with migration selector
- **Database**: No schema changes required (category relationships already exist)
