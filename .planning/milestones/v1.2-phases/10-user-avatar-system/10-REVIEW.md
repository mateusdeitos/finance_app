---
phase: 10-user-avatar-system
reviewed: 2026-04-17T12:00:00Z
depth: standard
files_reviewed: 24
files_reviewed_list:
  - backend/internal/domain/account.go
  - backend/internal/domain/user.go
  - backend/internal/domain/user_connection.go
  - backend/internal/entity/account.go
  - backend/internal/entity/user.go
  - backend/internal/entity/user_connection.go
  - backend/internal/handler/auth_handler.go
  - backend/internal/repository/account_repository.go
  - backend/internal/service/auth_service.go
  - backend/migrations/20260417000000_add_avatar_url_to_users.sql
  - backend/migrations/20260417000001_add_avatar_background_color_to_accounts.sql
  - frontend/src/api/accounts.ts
  - frontend/src/api/auth.ts
  - frontend/src/components/AccountAvatar.tsx
  - frontend/src/components/AppLayout.tsx
  - frontend/src/components/UserAvatar.tsx
  - frontend/src/components/accounts/AccountCard.tsx
  - frontend/src/components/accounts/AccountDrawer.tsx
  - frontend/src/components/accounts/AccountForm.tsx
  - frontend/src/components/accounts/ColorSwatchPicker.tsx
  - frontend/src/components/transactions/TransactionRow.tsx
  - frontend/src/components/transactions/form/SplitSettingsFields.tsx
  - frontend/src/types/transactions.ts
  - frontend/src/utils/getInitials.ts
findings:
  critical: 1
  warning: 2
  info: 2
  total: 5
status: issues_found
---

# Phase 10: Code Review Report

**Reviewed:** 2026-04-17T12:00:00Z
**Depth:** standard
**Files Reviewed:** 24
**Status:** issues_found

## Summary

This phase adds a user avatar system (OAuth avatar URL on users, background color on accounts, partner avatar/name on user connections). The backend changes include two migrations, entity/domain model additions, auth service updates to persist avatars on login, and repository query changes to expose partner info. The frontend adds `UserAvatar` and `AccountAvatar` components, a `ColorSwatchPicker` for account forms, and wires avatar data throughout the UI.

One critical issue was found: the `UserConnection` entity struct adds fields without GORM exclusion tags, which will cause SQL errors on create/update operations. Two warnings address a missing `avatar_background_color` column in the migration default vs domain nullability mismatch, and an unused prop in a component. Two informational items note minor improvements.

## Critical Issues

### CR-01: UserConnection entity fields without `gorm:"-"` tags will break Create/Save operations

**File:** `backend/internal/entity/user_connection.go:21-22`
**Issue:** `PartnerAvatarURL` and `PartnerName` were added to the `UserConnection` entity struct without `gorm:"-"` tags. These fields have no corresponding columns in the `user_connections` database table (no migration adds them). GORM will include these fields in `INSERT` and `UPDATE`/`SAVE` SQL statements, causing PostgreSQL errors like `column "partner_avatar_url" of relation "user_connections" does not exist`. This breaks `userConnectionRepository.Create()` and `userConnectionRepository.Update()` -- both of which are called during normal connection management flows.

These fields are only meant to be populated via the JSON scanning path in the account search query (where they come from a `jsonb_build_object` subquery, not from actual table columns).

**Fix:**
```go
type UserConnection struct {
	ID                         int                             `json:"id"`
	FromUserID                 int                             `json:"from_user_id"`
	FromAccountID              int                             `json:"from_account_id"`
	FromDefaultSplitPercentage int                             `json:"from_default_split_percentage"`
	ToUserID                   int                             `json:"to_user_id"`
	ToAccountID                int                             `json:"to_account_id"`
	ToDefaultSplitPercentage   int                             `json:"to_default_split_percentage"`
	ConnectionStatus           domain.UserConnectionStatusEnum `json:"connection_status"`
	CreatedAt                  *time.Time                      `json:"created_at"`
	UpdatedAt                  *time.Time                      `json:"updated_at"`
	PartnerAvatarURL           *string                         `json:"partner_avatar_url" gorm:"-"`
	PartnerName                *string                         `json:"partner_name" gorm:"-"`
}
```

## Warnings

### WR-01: Migration sets NOT NULL DEFAULT but domain model uses nullable pointer

**File:** `backend/migrations/20260417000001_add_avatar_background_color_to_accounts.sql:2`
**Issue:** The migration adds `avatar_background_color VARCHAR(7) NOT NULL DEFAULT '#457b9d'`, but the domain model (`domain.Account`) and entity (`entity.Account`) define the field as `*string` (nullable pointer). This mismatch means the Go code treats the field as optional (`omitempty` in JSON), while the database enforces it as required. If Go code ever sends a nil/NULL value for this field in an update, the database will reject it. Additionally, the frontend `AccountAvatar` component falls back to `#457b9d` when the value is undefined (line 30), suggesting the intent was nullable -- but the DB says otherwise.

**Fix:** Either make the migration column nullable to match the Go model:
```sql
ALTER TABLE accounts ADD COLUMN avatar_background_color VARCHAR(7) DEFAULT '#457b9d';
```
Or change the Go domain/entity to use a non-pointer `string` with a default value, and remove `omitempty` from the JSON tag.

### WR-02: AccountForm accepts unused `account` prop

**File:** `frontend/src/components/accounts/AccountForm.tsx:21`
**Issue:** The `Props` interface declares an `account?: Transactions.Account` prop, but the `AccountForm` component destructures only `{ initialValues, onSubmit, isPending, error }` on line 27, ignoring `account` entirely. This is dead code in the interface that could confuse future maintainers into thinking it is used.

**Fix:** Remove the unused `account` prop from the `Props` interface:
```tsx
interface Props {
  initialValues?: Partial<AccountFormValues>
  onSubmit: (values: AccountFormValues) => void
  isPending: boolean
  error?: string
}
```

## Info

### IN-01: Inline Avatar in SplitSettingsFields could use UserAvatar component

**File:** `frontend/src/components/transactions/form/SplitSettingsFields.tsx:210-219`
**Issue:** The `SplitRow` component manually creates an `<Avatar>` with `src`, `getInitials`, and hardcoded `color="blue"` instead of using the existing `UserAvatar` component (or `AccountAvatar` for shared accounts). This duplicates avatar rendering logic.

**Fix:** Consider replacing the inline Avatar with the `AccountAvatar` component for consistency:
```tsx
<AccountAvatar account={selectedAccount} size="sm" />
```

### IN-02: `eslint-disable` comment for `any` type usage in SplitSettingsFields

**File:** `frontend/src/components/transactions/form/SplitSettingsFields.tsx:25`
**Issue:** `type AnyFormValues = any` with an eslint-disable comment. While this is a pragmatic workaround for `useFormContext` across different form shapes, it disables type safety for all form field access in this component.

**Fix:** Consider creating a minimal interface with the shared fields (`amount`, `split_settings`) that both form types satisfy, to retain some type safety while remaining generic.

---

_Reviewed: 2026-04-17T12:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
