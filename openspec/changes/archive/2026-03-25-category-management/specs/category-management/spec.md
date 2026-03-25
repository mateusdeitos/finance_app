## ADDED Requirements

### Requirement: Category has an optional emoji field
Each category MAY have an emoji stored as a nullable string. The emoji is displayed alongside the category name throughout the UI.

#### Scenario: Create category with emoji
- **WHEN** a user creates a category with an `emoji` field set
- **THEN** the category is saved with that emoji and returned in subsequent Search responses

#### Scenario: Create category without emoji
- **WHEN** a user creates a category without an `emoji` field
- **THEN** the category is saved with `emoji` as `null` and no error is returned

#### Scenario: Update category emoji
- **WHEN** a user updates a category and changes the `emoji` field
- **THEN** the updated emoji is persisted and returned in subsequent responses

---

### Requirement: Sibling name uniqueness (trimmed, case-insensitive)
No two categories belonging to the same user, at the same tree level (same `parent_id`), SHALL share the same name after trimming leading/trailing whitespace and comparing case-insensitively.

#### Scenario: Create duplicate sibling name
- **WHEN** a user attempts to create a category whose trimmed name matches an existing sibling
- **THEN** the system returns a `400` error with code `VALIDATION_ERROR` and a message indicating the name is already taken at that level

#### Scenario: Update to duplicate sibling name
- **WHEN** a user attempts to update a category's name to match an existing sibling's trimmed name
- **THEN** the system returns a `400` error with code `VALIDATION_ERROR` and a message indicating the name is already taken at that level

#### Scenario: Same name at different levels is allowed
- **WHEN** a user creates a category with a name that already exists under a different parent
- **THEN** the category is created successfully

#### Scenario: Trimmed name uniqueness
- **WHEN** a user creates a category named `"Food "` and a sibling named `"food"` already exists
- **THEN** the system returns a `400` error indicating duplicate name

---

### Requirement: Delete category with optional transaction migration
When a category is deleted, the user MAY provide a `replace_with_id` to reassign all transactions currently using the deleted category. If not provided, the `category_id` on those transactions SHALL be set to `NULL`.

#### Scenario: Delete category with replacement
- **WHEN** a user deletes category A with `replace_with_id` set to category B's ID
- **THEN** all transactions with `category_id = A` are updated to `category_id = B`, and category A is deleted, in a single atomic operation

#### Scenario: Delete category without replacement
- **WHEN** a user deletes category A without providing `replace_with_id`
- **THEN** all transactions with `category_id = A` have `category_id` set to `NULL`, and category A is deleted, in a single atomic operation

#### Scenario: Replace with same category is rejected
- **WHEN** a user deletes category A with `replace_with_id` set to A's own ID
- **THEN** the system returns a `400` error with a translated message indicating the replacement category must be different

#### Scenario: Replace with non-existent category is rejected
- **WHEN** a user deletes category A with `replace_with_id` set to an ID that does not exist or does not belong to the user
- **THEN** the system returns a `400` error with a translated message indicating the replacement category was not found

---

### Requirement: Categories management page (frontend)
The application SHALL provide a `/categories` page where users can view, edit, and delete their categories in a tree structure.

#### Scenario: View categories as tree
- **WHEN** a user navigates to `/categories`
- **THEN** root categories are listed, each displaying their emoji (if set) and name, with child categories nested below their parent

#### Scenario: Edit category name and emoji
- **WHEN** a user clicks the edit action on a category card
- **THEN** an edit form opens pre-filled with the current name and emoji, allowing the user to update and save

#### Scenario: Delete category — choose replacement
- **WHEN** a user initiates delete on a category
- **THEN** a confirmation dialog appears offering a dropdown to select a replacement category (excluding the category being deleted)
- **AND WHEN** the user confirms with a replacement selected
- **THEN** the delete request is sent with `replace_with_id` and the category is removed from the list

#### Scenario: Delete category — no replacement
- **WHEN** a user initiates delete on a category and confirms without selecting a replacement
- **THEN** the delete request is sent without `replace_with_id`, setting affected transactions' category to none

#### Scenario: Backend validation error is translated
- **WHEN** the backend returns a validation error (duplicate name or invalid replacement)
- **THEN** the error message is displayed to the user in a readable, translated format near the relevant field or in a toast notification
