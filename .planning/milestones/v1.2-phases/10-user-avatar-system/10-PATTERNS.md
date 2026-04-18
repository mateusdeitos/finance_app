# Phase 10: User Avatar System - Pattern Map

**Mapped:** 2026-04-17
**Files analyzed:** 18 new/modified files
**Analogs found:** 17 / 18

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `backend/migrations/20260417000000_add_avatar_url_to_users.sql` | migration | batch | `backend/migrations/20260318000000_add_external_id_to_users.sql` | exact |
| `backend/migrations/20260417000001_add_avatar_background_color_to_accounts.sql` | migration | batch | `backend/migrations/20260325000000_add_is_active_to_accounts.sql` | exact |
| `backend/internal/domain/user.go` | model | CRUD | `backend/internal/domain/account.go` | exact (same nullable field pattern) |
| `backend/internal/domain/account.go` | model | CRUD | `backend/internal/domain/account.go` | self (extension) |
| `backend/internal/domain/user_connection.go` | model | CRUD | `backend/internal/domain/user_connection.go` | self (extension) |
| `backend/internal/entity/user.go` | model | CRUD | `backend/internal/entity/account.go` | exact |
| `backend/internal/entity/account.go` | model | CRUD | `backend/internal/entity/account.go` | self (extension) |
| `backend/internal/repository/account_repository.go` | repository | CRUD | `backend/internal/repository/account_repository.go` | self (extension) |
| `backend/internal/service/auth_service.go` | service | request-response | `backend/internal/service/auth_service.go` | self (extension) |
| `frontend/src/api/auth.ts` | service | request-response | `frontend/src/api/accounts.ts` | role-match |
| `frontend/src/types/transactions.ts` | model | CRUD | `frontend/src/types/transactions.ts` | self (extension) |
| `frontend/src/utils/getInitials.ts` | utility | transform | `frontend/src/components/transactions/form/SplitSettingsFields.tsx` (lines 34-40) | role-match (extract) |
| `frontend/src/components/UserAvatar.tsx` | component | request-response | `frontend/src/routes/_authenticated.connect-with.$externalId.tsx` (lines 62-64) | role-match |
| `frontend/src/components/AccountAvatar.tsx` | component | request-response | `frontend/src/components/accounts/AccountCard.tsx` | role-match |
| `frontend/src/components/accounts/ColorSwatchPicker.tsx` | component | request-response | `frontend/src/components/transactions/form/SplitSettingsFields.tsx` (RHF setValue pattern) | partial-match |
| `frontend/src/components/accounts/AccountForm.tsx` | component | CRUD | `frontend/src/components/accounts/AccountForm.tsx` | self (extension) |
| `frontend/src/components/AppLayout.tsx` | component | request-response | `frontend/src/components/AppLayout.tsx` | self (extension) |
| `frontend/src/components/transactions/TransactionRow.tsx` | component | request-response | `frontend/src/components/transactions/TransactionRow.tsx` | self (extension) |
| `frontend/src/components/accounts/AccountCard.tsx` | component | request-response | `frontend/src/components/accounts/AccountCard.tsx` | self (extension) |
| `frontend/src/components/transactions/form/SplitSettingsFields.tsx` | component | request-response | `frontend/src/components/transactions/form/SplitSettingsFields.tsx` | self (extension) |

---

## Pattern Assignments

### `backend/migrations/20260417000000_add_avatar_url_to_users.sql` (migration, batch)

**Analog:** `backend/migrations/20260318000000_add_external_id_to_users.sql`

**Full analog content** (lines 1-5):
```sql
-- +goose Up
ALTER TABLE users ADD COLUMN external_id UUID NOT NULL DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX idx_users_external_id ON users(external_id);

-- +goose Down
DROP INDEX IF EXISTS idx_users_external_id;
ALTER TABLE users DROP COLUMN IF EXISTS external_id;
```

**Copy pattern:** Use `ALTER TABLE ... ADD COLUMN` with goose Up/Down markers. For `avatar_url` use `TEXT` type, nullable (no DEFAULT), since empty AvatarURL from provider should be stored as NULL per D-02/Pitfall 2:
```sql
-- +goose Up
ALTER TABLE users ADD COLUMN avatar_url TEXT;

-- +goose Down
ALTER TABLE users DROP COLUMN IF EXISTS avatar_url;
```

---

### `backend/migrations/20260417000001_add_avatar_background_color_to_accounts.sql` (migration, batch)

**Analog:** `backend/migrations/20260325000000_add_is_active_to_accounts.sql` — column addition with DEFAULT for existing rows

**Copy pattern** (D-07: no null state, auto-backfill existing rows):
```sql
-- +goose Up
ALTER TABLE accounts ADD COLUMN avatar_background_color VARCHAR(7) NOT NULL DEFAULT '#457b9d';

-- +goose Down
ALTER TABLE accounts DROP COLUMN IF EXISTS avatar_background_color;
```

Note: PostgreSQL backfills existing rows with `'#457b9d'` automatically when `ADD COLUMN ... DEFAULT` is used. This satisfies D-07.

---

### `backend/internal/domain/user.go` (model, CRUD)

**Analog:** `backend/internal/domain/account.go` — uses `*string` + `omitempty` for nullable optional field

**Existing nullable optional field pattern** (`account.go` line 9):
```go
Description    *string         `json:"description,omitempty"`
```

**Apply this pattern** — add `AvatarURL` as `*string` with `omitempty`:
```go
// backend/internal/domain/user.go
type User struct {
    ID         int       `json:"id"`
    ExternalID string    `json:"external_id"`
    Name       string    `json:"name"`
    Email      string    `json:"email"`
    Password   string    `json:"-"`
    AvatarURL  *string   `json:"avatar_url,omitempty"`  // ADD
    CreatedAt  time.Time `json:"created_at"`
    UpdatedAt  time.Time `json:"updated_at"`
}
```

---

### `backend/internal/domain/account.go` (model extension, CRUD)

**Self-extension.** Add `AvatarBackgroundColor` field following the same `*string` + `omitempty` pattern as `Description`:

```go
// backend/internal/domain/account.go — add after Description field (line 9)
AvatarBackgroundColor *string         `json:"avatar_background_color,omitempty"`
```

---

### `backend/internal/domain/user_connection.go` (model extension, CRUD)

**Self-extension.** Add `PartnerAvatarURL` and `PartnerName` fields to enable frontend rendering of partner avatars without extra API calls:

```go
// backend/internal/domain/user_connection.go — add to UserConnection struct
PartnerAvatarURL *string `json:"partner_avatar_url,omitempty"`
PartnerName      *string `json:"partner_name,omitempty"`
```

---

### `backend/internal/entity/user.go` (model, CRUD)

**Analog:** `backend/internal/entity/account.go` — full ToDomain/FromDomain conversion pattern

**Existing conversion pattern** (`entity/account.go` lines 25-63):
```go
func (a *Account) ToDomain() *domain.Account {
    acc := &domain.Account{
        ID:          a.ID,
        // ... all fields mapped 1:1 ...
        Description: a.Description,
    }
    // ... conditional logic for nested structs ...
    return acc
}

func AccountFromDomain(d *domain.Account) *Account {
    a := &Account{
        ID:          d.ID,
        Description: d.Description,
    }
    return a
}
```

**Apply to user.go** — add `AvatarURL *string` to `entity.User` struct and propagate in both `ToDomain()` and `UserFromDomain()`:
```go
// entity/User struct — add field
AvatarURL  *string

// ToDomain()
AvatarURL:  u.AvatarURL,

// UserFromDomain()
AvatarURL: d.AvatarURL,
```

**CRITICAL:** `userRepo.Update` uses `Save` (full record overwrite, `user_repository.go` line 63) — not a `Select` whitelist. No extra change needed for the update path on user.

---

### `backend/internal/entity/account.go` (model extension, CRUD)

**Self-extension.** Add `AvatarBackgroundColor *string` to entity struct and both conversion functions.

**Existing field mapping for optional string** (lines 29, 50):
```go
// In Account struct
Description    *string

// In ToDomain()
Description:    a.Description,

// In AccountFromDomain()
Description:    d.Description,
```

Copy this pattern for `AvatarBackgroundColor`.

**Also extend `AccountUserConnection`** — it embeds `UserConnection`. Update the `UserConnection` entity struct to include `PartnerAvatarURL` and `PartnerName` nullable string fields so the JSON `Scan` in `AccountUserConnection` picks them up from the SQL jsonb result.

---

### `backend/internal/repository/account_repository.go` (repository, CRUD)

**Self-extension.** The `Search` method (lines 94-154) builds a `jsonb_build_object` for `user_connection` when `UserIDs` is provided (lines 108-122). Two changes needed:

**Change 1 — Extend jsonb_build_object** (lines 108-122) to include partner avatar URL and name via correlated subquery:
```go
// Replace the existing jsonb_build_object block (lines 108-122):
query = query.Select(`accounts.*, CASE WHEN user_connections.id IS NOT NULL THEN
    jsonb_build_object(
        'id', user_connections.id,
        'from_user_id', user_connections.from_user_id,
        'from_account_id', user_connections.from_account_id,
        'from_default_split_percentage', user_connections.from_default_split_percentage,
        'to_user_id', user_connections.to_user_id,
        'to_account_id', user_connections.to_account_id,
        'to_default_split_percentage', user_connections.to_default_split_percentage,
        'connection_status', user_connections.connection_status,
        'created_at', user_connections.created_at,
        'updated_at', user_connections.updated_at,
        'partner_avatar_url', (
            SELECT u.avatar_url FROM users u
            WHERE u.id = CASE
                WHEN user_connections.from_user_id = ANY(?)
                    THEN user_connections.to_user_id
                ELSE user_connections.from_user_id
            END
        ),
        'partner_name', (
            SELECT u.name FROM users u
            WHERE u.id = CASE
                WHEN user_connections.from_user_id = ANY(?)
                    THEN user_connections.to_user_id
                ELSE user_connections.from_user_id
            END
        )
    )
ELSE NULL
END AS user_connection`, options.UserIDs, options.UserIDs)
```

Note: GORM passes `options.UserIDs` as the `?` positional parameters. The CASE uses the UserIDs list to determine who the "partner" is from the perspective of the requesting user.

**Change 2 — Add `avatar_background_color` to Update Select** (line 72):
```go
// account_repository.go Update method — existing (line 70-73)
return GetTxFromContext(ctx, r.db).
    Model(ent).
    Select("name", "description", "initial_balance", "updated_at").
    Updates(ent).Error

// Change to (add avatar_background_color):
return GetTxFromContext(ctx, r.db).
    Model(ent).
    Select("name", "description", "initial_balance", "avatar_background_color", "updated_at").
    Updates(ent).Error
```

**CRITICAL PITFALL:** If `avatar_background_color` is NOT added to this `Select` list, account edits will silently drop the color on save (verified: `account_repository.go` line 72 uses explicit column whitelist).

---

### `backend/internal/service/auth_service.go` (service, request-response)

**Self-extension.** `OAuthCallback` (lines 36-102) retrieves or creates the user but never updates `avatar_url` on re-login. Two changes needed:

**Change 1 — Update existing user branch** (after line 55, inside `if userSocial != nil` block):
```go
// auth_service.go — existing-user branch (after line 55):
dbUser, err = s.userRepo.GetByID(ctx, userSocial.UserID)
if err != nil {
    return nil, "", apperrors.Internal("failed to get user", err)
}
// ADD: overwrite avatar on every login (D-02)
dbUser.AvatarURL = user.AvatarURL
if err := s.userRepo.Update(ctx, dbUser); err != nil {
    return nil, "", apperrors.Internal("failed to update user avatar", err)
}
```

**Change 2 — New user creation branch** (line 58-62): also set AvatarURL when creating a new user:
```go
dbUser = &domain.User{
    Name:      user.Name,
    Email:     user.Email,
    AvatarURL: user.AvatarURL,  // ADD
    Password:  "",
    CreatedAt: time.Now(),
    UpdatedAt: time.Now(),
}
```

**Error handling pattern** (consistent with rest of service, lines 44-46):
```go
return nil, "", apperrors.Internal("failed to update user avatar", err)
```

Note: `userRepo.Update` uses GORM `Save` (full record overwrite, `user_repository.go` line 63) — correct for avatar updates.

---

### `frontend/src/api/auth.ts` (service, request-response)

**Analog:** `frontend/src/api/accounts.ts` — same fetch + credentials + TypeScript type pattern

**Existing Me type** (lines 3-8):
```typescript
export type Me = {
  id: number
  external_id: string
  name: string
  email: string
}
```

**Add `avatar_url` optional field** (consistent with backend `omitempty`):
```typescript
export type Me = {
  id: number
  external_id: string
  name: string
  email: string
  avatar_url?: string  // ADD
}
```

No changes needed to `fetchMe` function — it already returns the full JSON response.

---

### `frontend/src/types/transactions.ts` (model, CRUD)

**Self-extension.** Two type extensions needed:

**Add `avatar_background_color` to Account** (after line 37):
```typescript
export interface Account {
  id: number
  user_id: number
  name: string
  description?: string
  initial_balance: number
  is_active: boolean
  avatar_background_color?: string  // ADD (D-04, will be non-null from migration)
  created_at?: string
  updated_at?: string
  user_connection?: UserConnection
}
```

**Add `partner_avatar_url` and `partner_name` to UserConnection** (after line 25):
```typescript
export interface UserConnection {
  id: number
  from_user_id: number
  from_account_id: number
  from_default_split_percentage: number
  to_user_id: number
  to_account_id: number
  to_default_split_percentage: number
  connection_status: "pending" | "accepted" | "rejected"
  partner_avatar_url?: string  // ADD — from SQL correlated subquery
  partner_name?: string        // ADD — for initials fallback
  created_at?: string
  updated_at?: string
}
```

---

### `frontend/src/utils/getInitials.ts` (utility, transform)

**Analog:** `frontend/src/components/transactions/form/SplitSettingsFields.tsx` lines 34-40 (extract verbatim)

**Source to extract** (`SplitSettingsFields.tsx` lines 34-40):
```typescript
function getInitials(text: string): string {
  return text
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("")
}
```

**Also reconcile with AppLayout pattern** (`AppLayout.tsx` lines 36-43):
```typescript
const initials = user?.name
  ? user.name
      .split(" ")
      .map((n) => n[0])
      .slice(0, 2)
      .join("")
      .toUpperCase()
  : "?";
```

The `SplitSettingsFields` version is cleaner (handles multiple spaces via `\s+`, optional chaining on `w[0]`). Export as a pure function:
```typescript
// frontend/src/utils/getInitials.ts
export function getInitials(text: string): string {
  return text
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("")
}
```

After extraction, update `SplitSettingsFields.tsx` and `AppLayout.tsx` to `import { getInitials } from "@/utils/getInitials"`.

---

### `frontend/src/components/UserAvatar.tsx` (component, request-response)

**Analog:** `frontend/src/routes/_authenticated.connect-with.$externalId.tsx` lines 62-64 — existing Avatar usage with initials + color

**Existing avatar pattern** (`connect-with.$externalId.tsx` lines 62-64):
```tsx
<Avatar color="blue" radius="xl" size="md">{initials}</Avatar>
```

**New component** — wraps Avatar with `src` + initials fallback, consistent with UI-SPEC sizes:
```tsx
// frontend/src/components/UserAvatar.tsx
import { Avatar, MantineSize } from "@mantine/core"
import { getInitials } from "@/utils/getInitials"

interface UserAvatarProps {
  name: string
  avatarUrl?: string
  size: MantineSize
  color?: string
}

export function UserAvatar({ name, avatarUrl, size, color = "blue" }: UserAvatarProps) {
  return (
    <Avatar src={avatarUrl} size={size} radius="xl" color={color}>
      {getInitials(name)}
    </Avatar>
  )
}
```

Mantine Avatar renders `children` (initials) automatically when `src` fails to load — no `onError` handler needed (D-03).

**Sizing constants per UI-SPEC (D-10):**
- Header: `size="sm"` (26px)
- Transaction rows: `size="xs"` (20px)
- Account list: `size="md"` (38px)
- Split settings: `size="sm"` (26px)

---

### `frontend/src/components/AccountAvatar.tsx` (component, request-response)

**Analog:** `frontend/src/components/accounts/AccountCard.tsx` lines 12-21 — reads `account.user_connection` to branch between shared/private

**Existing shared-account branch pattern** (`AccountCard.tsx` lines 13, 30):
```tsx
const isShared = !!account.user_connection
// ...
{!isShared && ( ... )}
```

**New component** — branches between private account (initials + user-chosen color) and shared account (partner OAuth avatar):
```tsx
// frontend/src/components/AccountAvatar.tsx
import { Avatar, MantineSize } from "@mantine/core"
import { getInitials } from "@/utils/getInitials"
import { Transactions } from "@/types/transactions"

interface AccountAvatarProps {
  account: Transactions.Account | null | undefined
  size: MantineSize
}

export function AccountAvatar({ account, size }: AccountAvatarProps) {
  if (!account) return <Avatar size={size} radius="xl" />

  const isShared = !!account.user_connection

  if (isShared) {
    const partnerAvatarUrl = account.user_connection?.partner_avatar_url
    const partnerName = account.user_connection?.partner_name ?? account.name
    return (
      <Avatar src={partnerAvatarUrl} size={size} radius="xl" color="grape">
        {getInitials(partnerName)}
      </Avatar>
    )
  }

  return (
    <Avatar
      size={size}
      radius="xl"
      style={{ backgroundColor: account.avatar_background_color ?? "#457b9d" }}
    >
      {getInitials(account.name)}
    </Avatar>
  )
}
```

---

### `frontend/src/components/accounts/ColorSwatchPicker.tsx` (component, request-response)

**Analog:** `frontend/src/components/transactions/form/SplitSettingsFields.tsx` — RHF `setValue` integration pattern (lines 61, 82-83)

**No exact analog exists** in the codebase for a swatch color picker. Use Mantine `ColorSwatch` in a `SimpleGrid` following the pattern from RESEARCH.md.

**RHF integration pattern** (from `SplitSettingsFields.tsx` lines 61, 82-83):
```tsx
const { control, register, setValue } = useFormContext<AnyFormValues>()
// ...
setValue(amountFieldName, calculatedAmount)
```

**ColorSwatchPicker component** (controlled via `value`/`onChange` — integrates with RHF via `Controller` or direct `setValue`):
```tsx
// frontend/src/components/accounts/ColorSwatchPicker.tsx
import { ColorSwatch, SimpleGrid, Text, Stack } from "@mantine/core"

const PRESET_COLORS = [
  "#1971c2", // blue
  "#2f9e44", // green
  "#e67700", // orange
  "#c92a2a", // red
  "#862e9c", // violet
  "#0c8599", // cyan
  "#5c940d", // lime
  "#e64980", // pink
  "#364fc7", // indigo
  "#f76707", // orange-deep
  "#495057", // gray
  "#457b9d", // steel (default)
]

interface ColorSwatchPickerProps {
  value: string
  onChange: (hex: string) => void
  label?: string
}

export function ColorSwatchPicker({ value, onChange, label }: ColorSwatchPickerProps) {
  return (
    <Stack gap="xs">
      {label && <Text size="sm" fw={500}>{label}</Text>}
      <SimpleGrid cols={6} spacing="xs">
        {PRESET_COLORS.map((color) => (
          <ColorSwatch
            key={color}
            color={color}
            size={28}
            onClick={() => onChange(color)}
            style={{
              cursor: "pointer",
              outline: value === color ? "2px solid var(--mantine-color-blue-6)" : "none",
              outlineOffset: 2,
            }}
          />
        ))}
      </SimpleGrid>
    </Stack>
  )
}
```

---

### `frontend/src/components/accounts/AccountForm.tsx` (component, CRUD)

**Self-extension.** Add `avatar_background_color` field to the zod schema and form, rendering `ColorSwatchPicker`.

**Existing schema pattern** (lines 9-13):
```typescript
const schema = z.object({
  name: z.string().min(1, 'Nome é obrigatório'),
  description: z.string().optional(),
  initial_balance: z.number().int(),
})
```

**Add color field to schema** (hex validation pattern from RESEARCH.md security section):
```typescript
const schema = z.object({
  name: z.string().min(1, 'Nome é obrigatório'),
  description: z.string().optional(),
  initial_balance: z.number().int(),
  avatar_background_color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#457b9d'),  // ADD
})
```

**Existing `setValue` + `useWatch` pattern for custom input** (lines 29, 47-48):
```typescript
const { register, handleSubmit, setValue, control, reset, formState: { errors } } = useForm<AccountFormValues>({...})
const initialBalance = useWatch({ control, name: 'initial_balance' })
// ...
<CurrencyInput value={initialBalance} onChange={(val) => setValue('initial_balance', val)} />
```

**Apply same pattern for ColorSwatchPicker** (copy the CurrencyInput pattern):
```tsx
const avatarColor = useWatch({ control, name: 'avatar_background_color' })
// ...
<ColorSwatchPicker
  label="Cor do avatar"
  value={avatarColor}
  onChange={(hex) => setValue('avatar_background_color', hex)}
/>
```

**Also update `AccountPayload` in `frontend/src/api/accounts.ts`** to include `avatar_background_color: string` so the HTTP PUT body sends the field.

---

### `frontend/src/components/AppLayout.tsx` (component, request-response)

**Self-extension.** Replace inline initials Avatar with `UserAvatar` component, passing `avatarUrl` from `useMe`.

**Existing inline Avatar + initials pattern** (lines 36-43, 75-77):
```tsx
const initials = user?.name
  ? user.name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase()
  : "?";
// ...
<Avatar color="blue" radius="xl" size="sm">
  {initials}
</Avatar>
```

**Replace with** (after extracting `getInitials` to util):
```tsx
import { UserAvatar } from "@/components/UserAvatar"
// Remove initials local computation
// ...
<UserAvatar name={user.name} avatarUrl={user.avatar_url} size="sm" />
```

The `user` object comes from `useMe()` (line 21). After adding `avatar_url` to the `Me` type, `user.avatar_url` is available directly.

---

### `frontend/src/components/transactions/TransactionRow.tsx` (component, request-response)

**Self-extension.** Rewrite `AccountCell` component (lines 40-68) to use `AccountAvatar` + `Tooltip` instead of text.

**Existing AccountCell structure** (lines 40-68) — two branches: transfer (stack with arrow) and non-transfer (plain text).

**Transfer branch existing pattern** (lines 49-60):
```tsx
return (
  <Stack gap={0} className={classes.transferAccounts}>
    <Text size="sm" c="dimmed" lineClamp={1}>{fromAccount?.name ?? "—"}</Text>
    <IconArrowDown size={12} style={{ opacity: 0.5 }} className={classes.transferArrow} />
    <Text size="sm" c="dimmed" lineClamp={1}>{toAccount?.name ?? "—"}</Text>
  </Stack>
)
```

**Tooltip usage pattern already in file** (lines 153-162):
```tsx
<Tooltip label={...} withArrow multiline maw={260}>
  <IconAlertCircle size={18} ... />
</Tooltip>
```

**Replace AccountCell with** (D-08, D-09):
```tsx
import { AccountAvatar } from "@/components/AccountAvatar"
import { IconArrowRight } from "@tabler/icons-react"

function AccountCell({ tx, groupBy, account, fromAccount, toAccount }) {
  if (groupBy === "account") return null

  if (tx.type === "transfer") {
    return (
      <Group gap={4} wrap="nowrap">
        <Tooltip label={fromAccount?.name ?? "—"} withArrow position="top">
          <span><AccountAvatar account={fromAccount} size="xs" /></span>
        </Tooltip>
        <IconArrowRight size={12} style={{ opacity: 0.5 }} />
        <Tooltip label={toAccount?.name ?? "—"} withArrow position="top">
          <span><AccountAvatar account={toAccount} size="xs" /></span>
        </Tooltip>
      </Group>
    )
  }

  return (
    <Tooltip label={account?.name ?? "—"} withArrow position="top">
      <span><AccountAvatar account={account} size="xs" /></span>
    </Tooltip>
  )
}
```

**CRITICAL:** Preserve `fromAccount`/`toAccount` derivation logic (lines 98-99) — do NOT re-derive from `tx.account_id` directly:
```tsx
const fromAccount = tx.operation_type === "debit" ? account : linkedAccount
const toAccount = tx.operation_type === "debit" ? linkedAccount : account
```

Note: Mantine `Tooltip` requires a DOM element that can accept a ref. Wrapping `AccountAvatar` (which renders Mantine `Avatar`) in a `<span>` is the safe pattern here.

---

### `frontend/src/components/accounts/AccountCard.tsx` (component, request-response)

**Self-extension.** Add `AccountAvatar` to the left of the account name in the card header.

**Existing card header Group** (lines 17-22):
```tsx
<Group justify="space-between" align="flex-start" wrap="nowrap">
  <Stack gap={4}>
    <Group gap="xs">
      <Text fw={600}>{account.name}</Text>
      {isShared && <Badge size="xs" variant="light" color="grape">Compartilhada</Badge>}
    </Group>
```

**Add AccountAvatar left of name** (D-11):
```tsx
import { AccountAvatar } from "@/components/AccountAvatar"
// ...
<Group gap="xs">
  <AccountAvatar account={account} size="md" />
  <Text fw={600}>{account.name}</Text>
  {isShared && <Badge size="xs" variant="light" color="grape">Compartilhada</Badge>}
</Group>
```

---

### `frontend/src/components/transactions/form/SplitSettingsFields.tsx` (component, request-response)

**Self-extension.** Minimal change — add `src` prop to the existing Avatar in `SplitRow` (lines 215-220).

**Existing Avatar** (lines 215-220):
```tsx
<Tooltip label={selectedAccount.description ?? selectedAccount.name} withArrow>
  <Avatar size="sm" radius="xl" color="blue" style={{ cursor: "default" }}>
    {getInitials(selectedAccount.description || selectedAccount.name)}
  </Avatar>
</Tooltip>
```

**Add `src` for partner avatar** (D-12):
```tsx
import { getInitials } from "@/utils/getInitials"  // switch to shared util
// ...
<Tooltip label={selectedAccount.description ?? selectedAccount.name} withArrow>
  <Avatar
    size="sm"
    radius="xl"
    color="blue"
    src={selectedAccount.user_connection?.partner_avatar_url}
    style={{ cursor: "default" }}
  >
    {getInitials(selectedAccount.description || selectedAccount.name)}
  </Avatar>
</Tooltip>
```

Also remove the local `getInitials` function definition (lines 34-40) and import from `@/utils/getInitials` instead.

---

## Shared Patterns

### Nullable Optional String Field (Backend Domain/Entity)
**Source:** `backend/internal/domain/account.go` line 9, `backend/internal/entity/account.go` lines 14-23
**Apply to:** All new domain and entity fields (`AvatarURL`, `AvatarBackgroundColor`, `PartnerAvatarURL`, `PartnerName`)
```go
// Domain field
FieldName *string `json:"field_name,omitempty"`

// Entity field
FieldName *string

// ToDomain
FieldName: e.FieldName,

// FromDomain
FieldName: d.FieldName,
```

### GORM Select Whitelist (Repository Update)
**Source:** `backend/internal/repository/account_repository.go` lines 68-74
**Apply to:** `accountRepo.Update` — any new writable field MUST be added to the `Select(...)` list
```go
return GetTxFromContext(ctx, r.db).
    Model(ent).
    Select("name", "description", "initial_balance", "avatar_background_color", "updated_at").
    Updates(ent).Error
```

### Service Error Pattern
**Source:** `backend/internal/service/auth_service.go` lines 44-46
**Apply to:** All new `if err != nil` blocks in service layer
```go
return nil, "", apperrors.Internal("descriptive message", err)
// or for non-multi-return:
return apperrors.Internal("descriptive message", err)
```

### React Hook Form + Custom Input (setValue + useWatch)
**Source:** `frontend/src/components/accounts/AccountForm.tsx` lines 29, 47-48
**Apply to:** `ColorSwatchPicker` integration in `AccountForm`
```tsx
const fieldValue = useWatch({ control, name: 'field_name' })
// ...
<CustomInput value={fieldValue} onChange={(val) => setValue('field_name', val)} />
```

### Mantine Tooltip Wrapping Avatar
**Source:** `frontend/src/components/transactions/form/SplitSettingsFields.tsx` lines 215-220
**Apply to:** All Avatar + Tooltip combinations in `TransactionRow.AccountCell`
```tsx
<Tooltip label={name ?? "—"} withArrow position="top">
  <span><Avatar ...>{initials}</Avatar></span>
</Tooltip>
```
Note: Wrapping in `<span>` ensures the DOM element accepts a ref for Tooltip positioning.

### Query Key Registration
**Source:** `frontend/src/utils/queryKeys.ts`
**Apply to:** Any new query hooks (no new queries expected in this phase — all data flows through existing `useAccounts` and `useMe` hooks)
```typescript
// If a new query is added, register in QueryKeys first:
export const QueryKeys = {
  Me: 'me',
  // ... add new keys here before using in useQuery
}
```

### Goose Migration Up/Down
**Source:** `backend/migrations/20260318000000_add_external_id_to_users.sql`
**Apply to:** Both new migration files
```sql
-- +goose Up
<forward migration SQL>

-- +goose Down
<rollback SQL>
```

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `frontend/src/components/accounts/ColorSwatchPicker.tsx` | component | request-response | No color picker component exists in the project. Use Mantine `ColorSwatch` in `SimpleGrid` per RESEARCH.md pattern. |

---

## Metadata

**Analog search scope:** `backend/internal/`, `backend/migrations/`, `frontend/src/`
**Files scanned:** 22 source files read directly
**Pattern extraction date:** 2026-04-17
