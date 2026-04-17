# Phase 10: User Avatar System - Research

**Researched:** 2026-04-17
**Domain:** Full-stack avatar system — PostgreSQL migrations, Go domain/entity/service/handler layers, React/TypeScript frontend with Mantine
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Add `avatar_url` column to `users` table (not user_socials). Simple, one query, no JOINs needed.
- **D-02:** Overwrite `avatar_url` on every OAuth login callback. Always fresh from provider.
- **D-03:** Fallback to initials when avatar URL fails to load. Mantine Avatar children (initials) already serve as fallback when `src` errors — zero extra work.
- **D-04:** User picks account avatar background color from a Mantine ColorSwatch preset palette (grid of ~12-16 colors). Stored as hex in `accounts` table.
- **D-05:** Account initials use first letter of first two words. "Nubank" → "N", "Cartão Visa" → "CV".
- **D-06:** Shared accounts display the connected user's OAuth avatar (partner's photo). Falls back to partner's initials if no avatar URL.
- **D-07:** Migration auto-assigns a default color to all existing accounts. No null state in frontend.
- **D-08:** Transfer rows replace account text with avatars: [source avatar] → [dest avatar]. Account names shown via Mantine Tooltip on hover/tap.
- **D-09:** Non-transfer transaction rows also show avatar only (no account name text), with tooltip.
- **D-10:** Contextual sizes: Header `sm` (26px), Transaction rows `xs` (20px), Account list `md` (38px), Split settings `sm` (26px).
- **D-11:** Account cards show avatar left of account name. Private = initials + user-picked color. Shared = partner's OAuth avatar.
- **D-12:** Replace current hardcoded initials in SplitSettingsFields with OAuth avatar photo when available. Keep initials as fallback.
- **D-13:** No optimistic updates for financial state transitions.

### Claude's Discretion

- Migration naming and timestamp conventions
- Exact preset color palette selection for ColorSwatch (UI-SPEC has 12 colors defined)
- Avatar component wrapper abstraction (if worth creating a shared component vs inline)
- Tooltip trigger timing and positioning details

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AVA-01 | Save avatar URL from OAuth provider on login | Goth `user.AvatarURL` field exists in `gothic.CompleteUserAuth` return; `auth_handler.go` line 93 builds `domainUser` but omits it; need DB column + domain field + service update |
| AVA-02 | Display user avatar in top header menu | `AppLayout.tsx` line 75 already has `<Avatar color="blue" radius="xl" size="sm">` — add `src={user?.avatar_url}` |
| AVA-03 | Show avatars in split settings connection list | `SplitSettingsFields.tsx` lines 215-220 has Avatar component — needs `src` prop + partner avatar_url in account/connection data |
| AVA-04 | Show transfer indication as avatar → avatar in transaction list | `TransactionRow.tsx` AccountCell lines 49-60 currently renders text; rewrite to `Avatar xs + Tooltip` pair |
| AVA-05 | Migrate account column in transaction list to always show avatar | Non-transfer branch of AccountCell (lines 63-67) currently shows `<Text>`; replace with `Avatar xs + Tooltip` |
| AVA-06 | Allow user to set background color for private account avatars | New `avatar_background_color` column on `accounts` table + `ColorSwatchPicker` component in `AccountForm` |
| AVA-07 | Show avatar in account list (shared accounts show connected user avatar) | `AccountCard.tsx` needs `AccountAvatar` added left of name; shared accounts need partner's `avatar_url` surfaced through API |
</phase_requirements>

---

## Summary

Phase 10 adds visual identity (avatars) across the full app stack. The backend work is narrow but touches multiple layers: two SQL migrations (add `avatar_url` to `users`, add `avatar_background_color` to `accounts`), domain/entity/service/handler updates to propagate the new fields, and one new data exposure challenge — partner's `avatar_url` must reach the frontend where `Transactions.Account.user_connection` is used.

The frontend work is broader: create shared `UserAvatar` and `AccountAvatar` components, extract `getInitials()` to a shared utility, add `ColorSwatchPicker`, update four existing components (AppLayout, TransactionRow AccountCell, AccountCard, SplitSettingsFields), and thread `avatar_url` through the `Me` type and `Transactions.Account` type.

The most complex integration point is AVA-03/AVA-07: the `UserConnection` type currently has no user-level data (name, avatar) attached — only IDs. The partner's `avatar_url` must be added to the connection/account response or fetched separately. The account `Search` query already builds a `jsonb_build_object` for `user_connection` in the SQL — extending it to include the partner user's `avatar_url` is the cleanest path.

**Primary recommendation:** Backend first (migrations → domain → entity → service/handler chain), then frontend (types → shared components → consumers).

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Store avatar URL from OAuth | Database (PostgreSQL) | API / Backend | Column addition; overwritten on every login |
| Extract AvatarURL from goth user | API / Backend | — | `auth_handler.go` builds domainUser; auth_service stores it |
| Expose avatar_url on /api/auth/me | API / Backend | — | `Me` endpoint returns `domain.User`; field is automatically serialized |
| Expose partner avatar_url via accounts | API / Backend | Database | account Search SQL builds user_connection JSON; extend it |
| Store account background color | Database (PostgreSQL) | API / Backend | Column addition with DEFAULT; migration auto-assigns existing rows |
| Display user avatar (header) | Browser / Client | — | Frontend-only; reads from `useMe` |
| Display account avatar (transaction row, account card, split settings) | Browser / Client | — | Frontend components; consumes API data |
| ColorSwatch color picker | Browser / Client | — | Form input in AccountDrawer/AccountForm |

---

## Standard Stack

### Core (already in project — verified by reading project files)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @mantine/core | ^7.17.0 | UI components: Avatar, Tooltip, ColorSwatch | Project design system [VERIFIED: frontend/package.json] |
| @tabler/icons-react | ^3.40.0 | Icons (IconArrowRight for transfer arrow) | Project icon library [VERIFIED: frontend/package.json] |
| react-hook-form | current | Form state (ColorSwatchPicker integrates via setValue) | Project form standard [VERIFIED: frontend/src/components/accounts/AccountForm.tsx] |
| zod | current | Form validation schema extension | Project validation standard [VERIFIED: AccountForm.tsx uses zodResolver] |
| gorm.io/gorm | current | ORM for DB migrations + selects | Project ORM [VERIFIED: entity files] |
| markbates/goth | current | OAuth provider; `user.AvatarURL` field on goth.User | Project OAuth library [VERIFIED: pkg/oauth/goth.go] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| goose | current (SQL migrations) | Schema migrations | Adding `avatar_url` and `avatar_background_color` columns |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Adding partner avatar_url to account Search SQL | New API endpoint | Endpoint adds a round-trip; SQL extension keeps it to one fetch |
| Shared `UserAvatar` component | Inline Avatar everywhere | Duplication; shared component is worth it given 5 usage sites |

---

## Architecture Patterns

### System Architecture Diagram

```
OAuth Callback
    │
    ▼
gothic.CompleteUserAuth() → goth.User{AvatarURL, Name, Email, UserID}
    │
    ▼
auth_handler.go → domain.User{AvatarURL: user.AvatarURL, ...}
    │
    ▼
authService.OAuthCallback() → userRepo.Update(user with avatar_url)
    │
    ├──► JWT issued → /api/auth/me returns domain.User{avatar_url}
    │         │
    │         ▼
    │    useMe() → AppLayout Avatar[src=avatar_url] (AVA-02)
    │
    └──► avatar_url stored in users table

Account Search
    │
    ▼
accountRepo.Search() → SQL LEFT JOIN user_connections
    │  jsonb_build_object includes partner user avatar_url via subquery
    ▼
domain.Account{UserConnection: {PartnerAvatarURL}}
    │
    ├──► TransactionRow AccountCell → Avatar xs + Tooltip (AVA-04, AVA-05)
    ├──► AccountCard → AccountAvatar left of name (AVA-07)
    └──► SplitSettingsFields → Avatar src=partnerAvatarUrl (AVA-03)

Account Create/Update
    │
    ▼
AccountForm + ColorSwatchPicker → avatar_background_color hex
    │
    ▼
PUT /api/accounts/{id} → accountRepo.Update() includes new column (AVA-06)
```

### Recommended Project Structure

No new directories. New files placed at:
```
frontend/src/
├── utils/
│   └── getInitials.ts           # extracted from SplitSettingsFields + AppLayout
├── components/
│   ├── UserAvatar.tsx           # shared Avatar wrapper (name, avatarUrl, size, color)
│   ├── AccountAvatar.tsx        # account-specific Avatar (private vs shared branching)
│   └── accounts/
│       ├── AccountForm.tsx      # extended with ColorSwatchPicker
│       └── ColorSwatchPicker.tsx # 12-swatch grid, emits hex

backend/
├── migrations/
│   ├── 20260417000000_add_avatar_url_to_users.sql
│   └── 20260417000001_add_avatar_background_color_to_accounts.sql
├── internal/domain/
│   ├── user.go                  # add AvatarURL *string
│   └── account.go               # add AvatarBackgroundColor *string
├── internal/entity/
│   ├── user.go                  # add AvatarURL, update ToDomain/FromDomain
│   └── account.go               # add AvatarBackgroundColor, update conversions
├── internal/repository/
│   └── account_repository.go    # extend jsonb_build_object for partner avatar_url
└── internal/service/
    └── auth_service.go          # update OAuthCallback to pass avatar_url; Update user
```

### Pattern 1: Migration Column Addition

Follows project pattern from `20260318000000_add_external_id_to_users.sql`:

```sql
-- +goose Up
ALTER TABLE users ADD COLUMN avatar_url TEXT;

-- +goose Down
ALTER TABLE users DROP COLUMN IF EXISTS avatar_url;
```

For accounts with default color (D-07 — no null state):
```sql
-- +goose Up
ALTER TABLE accounts ADD COLUMN avatar_background_color VARCHAR(7) NOT NULL DEFAULT '#457b9d';

-- +goose Down
ALTER TABLE accounts DROP COLUMN IF EXISTS avatar_background_color;
```

[VERIFIED: migration pattern from backend/migrations/20260318000000_add_external_id_to_users.sql]

### Pattern 2: Domain Field Addition (nullable string)

```go
// backend/internal/domain/user.go
type User struct {
    // ... existing fields ...
    AvatarURL *string `json:"avatar_url,omitempty"`
}
```

Using `*string` + `omitempty` is consistent with the project pattern (`Description *string` in Account). [VERIFIED: backend/internal/domain/account.go line 8]

### Pattern 3: Entity ToDomain/FromDomain Extension

```go
// backend/internal/entity/user.go
type User struct {
    // ... existing fields ...
    AvatarURL *string
}

func (u *User) ToDomain() *domain.User {
    return &domain.User{
        // ... existing mappings ...
        AvatarURL: u.AvatarURL,
    }
}

func UserFromDomain(d *domain.User) *User {
    return &User{
        // ... existing mappings ...
        AvatarURL: d.AvatarURL,
    }
}
```

[VERIFIED: entity/user.go and entity/account.go follow this pattern exactly]

### Pattern 4: Auth Service — Update User on OAuth Login (D-02)

Currently `OAuthCallback` in `auth_service.go` creates user but **never updates existing user's name/avatar on re-login** (lines 50-55: existing social → GetByID → generate token, no update). D-02 requires overwriting `avatar_url` on every login. This means adding an explicit `userRepo.Update()` call after the existing-user branch:

```go
// After retrieving dbUser for existing social account:
dbUser.AvatarURL = user.AvatarURL  // from domain.User passed from handler
if err := s.userRepo.Update(ctx, dbUser); err != nil {
    return nil, "", apperrors.Internal("failed to update user avatar", err)
}
```

The handler must pass `AvatarURL` in the `domainUser` it constructs:
```go
// auth_handler.go line 93
domainUser := &domain.User{
    Name:      user.Name,
    Email:     user.Email,
    AvatarURL: &user.AvatarURL,  // goth.User field
}
```

[VERIFIED: auth_handler.go lines 93-96, auth_service.go lines 50-55]

Note: `userRepo.Update` uses `Save` (full record overwrite) [VERIFIED: user_repository.go line 62]. This is correct for avatar updates.

### Pattern 5: Partner Avatar URL in Account Search SQL

The account `Search` query builds a `jsonb_build_object` for `user_connection`. To expose partner `avatar_url`, add a correlated subquery:

```sql
jsonb_build_object(
    'id', user_connections.id,
    -- ... existing fields ...
    'partner_avatar_url', (
        SELECT u.avatar_url
        FROM users u
        WHERE u.id = CASE
            WHEN user_connections.from_user_id IN (options.UserIDs)
                THEN user_connections.to_user_id
            ELSE user_connections.from_user_id
        END
    )
)
```

This requires adding `PartnerAvatarURL *string` to `domain.UserConnection` and extending the entity JSON scan. [VERIFIED: account_repository.go lines 108-133, user_connection domain file]

### Pattern 6: Frontend UserAvatar Component

UI-SPEC defines the exact shape:
```tsx
// frontend/src/components/UserAvatar.tsx
interface UserAvatarProps {
  name: string
  avatarUrl?: string
  size: MantineSize
  color?: string
}

export function UserAvatar({ name, avatarUrl, size, color }: UserAvatarProps) {
  return (
    <Avatar src={avatarUrl} size={size} radius="xl" color={color}>
      {getInitials(name)}
    </Avatar>
  )
}
```

Mantine Avatar automatically shows children (initials) when `src` fails to load. [VERIFIED: CONTEXT.md D-03, UI-SPEC Component Inventory]

### Pattern 7: ColorSwatchPicker Form Integration

```tsx
// ColorSwatchPicker emits hex, integrated via RHF setValue
interface ColorSwatchPickerProps {
  value: string
  onChange: (hex: string) => void
}
```

AccountForm adds `avatar_background_color` to its schema and passes the field to ColorSwatchPicker. [VERIFIED: AccountForm.tsx — uses RHF with zodResolver, same pattern as other fields]

### Anti-Patterns to Avoid

- **Storing avatar URL in user_socials instead of users:** Decision D-01 is locked — users table. user_socials has provider-specific data, multiple rows per user possible.
- **Optimistic updates on account mutation:** D-13 prohibits optimistic updates for financial state. Avatar color is on accounts (financial entity) — follow non-optimistic pattern.
- **Fetching partner avatar_url via a separate API call:** Adds a waterfall. Extend the existing accounts Search SQL instead.
- **Embedding avatar_url directly in JWT claims:** Avatar URLs are provider-controlled and mutable. Always fetch from DB via `/api/auth/me`.
- **Using `gorm Save` without selecting columns in accountRepo.Update:** The current `accountRepo.Update` uses `Select("name", "description", "initial_balance", "updated_at")` [VERIFIED: account_repository.go line 69]. The `avatar_background_color` field MUST be added to this Select list, otherwise updates will silently drop it.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Avatar image fallback to initials | Custom error handler on `<img>` | Mantine Avatar `src` + children | Built-in onerror fallback; children shown automatically |
| Color picker grid | Custom swatch grid | Mantine `ColorSwatch` in a SimpleGrid | Touch-friendly, accessible, consistent with design system |
| Initials computation | Inline string logic in each component | Shared `getInitials.ts` utility | Already exists in 2 places; extract, don't duplicate |
| Tooltip on mobile | Custom tap handler | Mantine `Tooltip` (built-in touch support) | Mantine Tooltip supports touch events natively |

**Key insight:** All avatar display primitives are already available in the Mantine library already installed in the project.

---

## Common Pitfalls

### Pitfall 1: accountRepo.Update Select List
**What goes wrong:** `avatar_background_color` is not saved when user edits account — silently dropped.
**Why it happens:** `accountRepo.Update` uses GORM's `Select(...)` to whitelist columns (line 69-72). New columns must be explicitly added.
**How to avoid:** Add `"avatar_background_color"` to the `Select(...)` call in `accountRepo.Update`.
**Warning signs:** Account form saves successfully but color reverts to default on reload.

### Pitfall 2: Nil AvatarURL in goth.User
**What goes wrong:** Panic or incorrect behavior when provider returns empty `AvatarURL`.
**Why it happens:** Some OAuth providers may not always return a profile picture URL (e.g., Microsoft accounts without a photo set).
**How to avoid:** Use `*string` in domain model. In handler, use `lo.ToPtr(user.AvatarURL)` or check emptiness: `if user.AvatarURL != "" { domainUser.AvatarURL = &user.AvatarURL }`.
**Warning signs:** 500 errors on OAuth callback for users without profile pictures.

### Pitfall 3: Partner Avatar URL Missing from Frontend Types
**What goes wrong:** `Transactions.UserConnection` type doesn't have `partner_avatar_url` — TypeScript compiler errors or runtime undefined access.
**Why it happens:** The `UserConnection` type in `frontend/src/types/transactions.ts` mirrors the backend response. Adding the field to the SQL response without adding it to the TypeScript type causes silent undefined behavior.
**How to avoid:** Update `Transactions.UserConnection` in `types/transactions.ts` to add `partner_avatar_url?: string` when extending the backend SQL.
**Warning signs:** Partner avatars render as initials-only even when partner has an OAuth photo.

### Pitfall 4: Transfer Arrow Direction
**What goes wrong:** Transfer avatars show in wrong order ([dest] → [source] instead of [source] → [dest]).
**Why it happens:** `TransactionRow.tsx` computes `fromAccount`/`toAccount` based on `operation_type` (debit = from, credit = to relative to the viewer). The existing logic at lines 98-99 is correct — must be preserved in the avatar rewrite.
**How to avoid:** Reuse existing `fromAccount`/`toAccount` variables in the new avatar layout. Do not re-derive from `tx.account_id` directly.
**Warning signs:** Transfers show reversed arrow direction.

### Pitfall 5: Missing Default Color in Migration (D-07)
**What goes wrong:** Frontend receives `null` for `avatar_background_color` on existing accounts, causing AccountAvatar to render with no background color.
**Why it happens:** Migration adds column without NOT NULL DEFAULT, or DEFAULT is set but existing rows are not backfilled.
**How to avoid:** Use `NOT NULL DEFAULT '#457b9d'` in migration — PostgreSQL backfills existing rows with the DEFAULT value automatically when column is added with DEFAULT.
**Warning signs:** AccountAvatar shows white/no-color background on pre-existing accounts.

### Pitfall 6: `Me` Type Out of Sync
**What goes wrong:** `avatar_url` available in backend response but TypeScript `Me` type in `frontend/src/api/auth.ts` doesn't include it — Mantine Avatar receives `undefined` silently.
**Why it happens:** `Me` type is manually maintained. Backend changes don't auto-propagate.
**How to avoid:** Update `Me` type to add `avatar_url?: string` as part of the same task that adds the domain field.
**Warning signs:** Header avatar never shows OAuth photo even after backend ships the field.

---

## Code Examples

### Extract goth.User AvatarURL in auth_handler.go

```go
// Source: auth_handler.go — modification of lines 93-96
user, err := gothic.CompleteUserAuth(c.Response(), c.Request())
// ...
var avatarURL *string
if user.AvatarURL != "" {
    avatarURL = &user.AvatarURL
}
domainUser := &domain.User{
    Name:      user.Name,
    Email:     user.Email,
    AvatarURL: avatarURL,
}
```

[VERIFIED: auth_handler.go lines 88-96, goth.User struct confirmed by pkg/oauth/goth.go imports]

### GORM Update with New Column

```go
// Source: account_repository.go Update method — add new column to Select
return GetTxFromContext(ctx, r.db).
    Model(ent).
    Select("name", "description", "initial_balance", "avatar_background_color", "updated_at").
    Updates(ent).Error
```

[VERIFIED: account_repository.go lines 69-72]

### Frontend AccountCell Rewrite (AVA-04, AVA-05)

```tsx
// Source: TransactionRow.tsx — replacement for AccountCell component
import { Avatar, Group, Tooltip } from '@mantine/core'
import { IconArrowRight } from '@tabler/icons-react'
import { AccountAvatar } from '@/components/AccountAvatar'

function AccountCell({ tx, groupBy, account, fromAccount, toAccount }) {
  if (groupBy === 'account') return null

  if (tx.type === 'transfer') {
    return (
      <Group gap={4} wrap="nowrap">
        <Tooltip label={fromAccount?.name ?? '—'} withArrow position="top">
          <span><AccountAvatar account={fromAccount} size="xs" /></span>
        </Tooltip>
        <IconArrowRight size={12} style={{ opacity: 0.5 }} />
        <Tooltip label={toAccount?.name ?? '—'} withArrow position="top">
          <span><AccountAvatar account={toAccount} size="xs" /></span>
        </Tooltip>
      </Group>
    )
  }

  return (
    <Tooltip label={account?.name ?? '—'} withArrow position="top">
      <span><AccountAvatar account={account} size="xs" /></span>
    </Tooltip>
  )
}
```

Note: Mantine Tooltip requires a DOM element child that can receive a ref — wrapping Avatar in `<span>` ensures Tooltip works correctly. [ASSUMED — standard Mantine Tooltip pattern; verify with Mantine docs if needed]

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Initials-only in AppLayout Avatar | Avatar with `src` + initials fallback | Phase 10 | OAuth photo shown; initials remain as fallback |
| Text account name in TransactionRow | Avatar xs + Tooltip | Phase 10 | Compact display; account name accessible via hover/tap |
| No color on account avatars | User-chosen hex from ColorSwatch | Phase 10 | Visual differentiation of accounts |

**Not deprecated:** The existing `getInitials` implementations in AppLayout and SplitSettingsFields are extracted (not deleted) — they become the single `getInitials.ts` utility.

---

## Key Integration Point: Partner Avatar URL Data Flow

This is the most architecturally significant decision in Phase 10.

**Problem:** `Transactions.Account.user_connection` currently has `from_user_id`, `to_user_id`, and other IDs — but no user-level data like `avatar_url` or `name`. The frontend needs the partner's `avatar_url` to render AccountAvatar on shared accounts (AVA-03, AVA-07).

**Recommended approach (from D-06 + codebase analysis):**

Extend the `jsonb_build_object` in `account_repository.go`'s `Search` query to include `partner_avatar_url` via a correlated subquery on the `users` table. Add `PartnerAvatarURL *string` to `domain.UserConnection`. This keeps it to one HTTP request.

**Frontend type extension:**
```typescript
// frontend/src/types/transactions.ts
export interface UserConnection {
  // ... existing fields ...
  partner_avatar_url?: string   // new
  partner_name?: string          // useful for fallback initials too
}
```

Including `partner_name` (partner's name) alongside `partner_avatar_url` is worth the minimal extra SQL cost — it enables correct initials fallback for the partner avatar without needing a separate API call. [ASSUMED — trade-off judgment; confirm if partner name is already derivable from existing data]

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Mantine Tooltip requires wrapping Avatar in `<span>` for ref forwarding | Code Examples | Tooltip may not position correctly; use `component="span"` on Avatar instead |
| A2 | Including `partner_name` in account Search SQL is cost-effective | Key Integration Point | Low risk — it's a simple scalar from users table; could omit and derive initials from account name |
| A3 | `goth.User.AvatarURL` is always a string (possibly empty, not nil) | Code Examples | If it's a pointer, the nil-check pattern changes |
| A4 | Microsoft OAuth via `microsoftonline` provider returns `AvatarURL` | Standard Stack | Microsoft Graph `/me/photo` requires special handling — may return empty for some accounts |

---

## Open Questions (RESOLVED)

1. **Does Microsoft OAuth via `markbates/goth/providers/microsoftonline` return AvatarURL?**
   - What we know: Google OAuth definitely returns profile photo URL via `email + profile` scopes. Microsoft uses `User.Read` scope.
   - What's unclear: Whether `goth` extracts the photo from Microsoft Graph into `AvatarURL` field, or leaves it empty.
   - RESOLVED: Treat `AvatarURL` as always-optional (`*string`). The feature degrades gracefully to initials for Microsoft users. Acceptable per D-03. No implementation change needed — the `*string` type and initials fallback in Mantine Avatar handle this automatically.

2. **Should `partner_name` be added to the account connection response?**
   - What we know: Partner's initials are needed as fallback when `partner_avatar_url` is absent/broken.
   - What's unclear: Whether the partner name can be derived from existing data the frontend already has.
   - RESOLVED: Include `partner_name` in the SQL extension — one simple join addition, eliminates a potential future gap. Planned in Plan 01 Task 2 (account_repository.go SQL extension) and Plan 02 (frontend type update).

---

## Environment Availability

Step 2.6: SKIPPED (no new external dependencies — all libraries already in project, migrations run via existing `just migrate-up` command)

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Go: testify (integration via testcontainers); Frontend: no test files found |
| Config file | backend: no pytest.ini (Go native); frontend: no jest/vitest config found |
| Quick run command | `cd backend && just test-unit` |
| Full suite command | `cd backend && just test-integration` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AVA-01 | avatar_url saved on OAuth login | integration | `go test ./internal/service/ -run TestAuth -tags=integration` | ❌ Wave 0 |
| AVA-02 | Header shows OAuth photo (visual) | manual-only | n/a | n/a |
| AVA-03 | Split settings avatar shows partner photo (visual) | manual-only | n/a | n/a |
| AVA-04 | Transfer row shows avatar pair + tooltip (visual) | manual-only | n/a | n/a |
| AVA-05 | Non-transfer row shows avatar + tooltip (visual) | manual-only | n/a | n/a |
| AVA-06 | Account create/edit saves and returns avatar_background_color | integration | `go test ./internal/service/ -run TestAccount -tags=integration` | ❌ Wave 0 |
| AVA-07 | Account list shows correct avatars (visual) | manual-only | n/a | n/a |

AVA-02 through AVA-05, AVA-07 are UI visual requirements — they are manual-only by nature (no automated visual regression in project). AVA-01 and AVA-06 have testable backend service behaviors.

### Sampling Rate
- **Per task commit:** `cd backend && just test-unit`
- **Per wave merge:** `cd backend && just test-integration`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `backend/internal/service/auth_service_test.go` — covers AVA-01 (avatar_url stored on OAuth login)
- [ ] `backend/internal/service/account_service_test.go` — covers AVA-06 (avatar_background_color create/update)

*(Frontend has no test infrastructure — consistent with existing project pattern; no frontend test gaps to flag)*

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | OAuth unchanged — only extracting additional field |
| V3 Session Management | no | No session changes |
| V4 Access Control | yes | Account update: existing ownership check in accountService.Update is preserved; `avatar_background_color` is a user-controlled field with no privilege escalation risk |
| V5 Input Validation | yes | `avatar_background_color` must be validated as a valid hex color string (7 chars: `#` + 6 hex digits); zod schema on frontend, backend regex or fixed-list check |
| V6 Cryptography | no | Not applicable |

### Known Threat Patterns for this Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Arbitrary hex injection via avatar_background_color | Tampering | Validate against fixed palette on backend (or regex `^#[0-9a-fA-F]{6}$`); frontend enforces via ColorSwatchPicker UI |
| Open redirect via avatar_url value | Spoofing | avatar_url is stored server-side and returned to own user; not a redirect target — rendered as `<img src>` only |
| Serving partner avatar_url to unauthorized user | Info Disclosure | account Search already filters by `user_id IN options.UserIDs`; partner URL is only visible to users in the same connection |

---

## Sources

### Primary (HIGH confidence)
- Codebase files read directly: `auth_handler.go`, `auth_service.go`, `account_repository.go`, `account_service.go`, `user_repository.go`, `entity/user.go`, `entity/account.go`, `domain/user.go`, `domain/account.go`, `domain/user_connection.go`, `repository/interfaces.go`, `service/interfaces.go`
- Frontend files read directly: `AppLayout.tsx`, `TransactionRow.tsx`, `AccountCard.tsx`, `SplitSettingsFields.tsx`, `AccountDrawer.tsx`, `AccountForm.tsx`, `api/auth.ts`, `api/accounts.ts`, `hooks/useMe.ts`, `utils/queryKeys.ts`, `types/transactions.ts`
- Migration file read: `20260318000000_add_external_id_to_users.sql`
- Context files read: `10-CONTEXT.md`, `10-UI-SPEC.md`, `STATE.md`, `CLAUDE.md`, `frontend/CLAUDE.md`, `backend/CLAUDE.md`

### Secondary (MEDIUM confidence)
- Mantine Avatar `src` + children fallback behavior [ASSUMED from Mantine documentation general knowledge — not verified via Context7 in this session]
- Mantine Tooltip touch event support [ASSUMED]

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — read directly from package.json and source files
- Architecture: HIGH — read all canonical files listed in CONTEXT.md
- Pitfalls: HIGH — identified from actual code paths (Select whitelist, null AvatarURL, type synchronization)
- Partner avatar integration: MEDIUM — SQL extension approach is sound but exact syntax for GORM jsonb extension needs care

**Research date:** 2026-04-17
**Valid until:** 2026-05-17 (stable codebase; no fast-moving dependencies)
