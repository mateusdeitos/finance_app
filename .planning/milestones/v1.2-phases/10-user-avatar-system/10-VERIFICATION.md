---
phase: 10-user-avatar-system
verified: 2026-04-17T18:10:00Z
status: human_needed
score: 12/12 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Log in via OAuth (Google) and verify profile photo appears in top-right header avatar instead of just initials"
    expected: "OAuth profile photo displayed at 26px in header; falls back to initials if no photo"
    why_human: "Visual rendering of external OAuth photo URL cannot be verified programmatically"
  - test: "Open Transactions page and hover over account avatars to see tooltips with account names"
    expected: "Small circular avatars (20px) in account column; tooltip shows account name on hover"
    why_human: "Tooltip interaction and avatar rendering require visual inspection"
  - test: "Find a transfer transaction and verify it shows [source avatar] -> [dest avatar] horizontally with arrow"
    expected: "Two avatars with right-arrow icon between them; correct direction (source left, dest right)"
    why_human: "Transfer direction correctness and layout require visual inspection"
  - test: "Open Accounts page and verify each account card shows avatar left of name (private = initials + color, shared = partner photo)"
    expected: "38px avatars; private accounts show colored initials; shared accounts show partner OAuth photo"
    why_human: "Visual appearance and shared vs private distinction require human judgment"
  - test: "Create or edit an account and verify ColorSwatchPicker with 12 colors in 4x3 grid appears; pick a color, save, reopen and verify it persists"
    expected: "Color picker with 12 swatches, selected state ring, color persists through save cycle"
    why_human: "Form interaction flow and persistence verification require manual testing"
  - test: "Open a transaction with split settings and verify partner avatar shows OAuth photo (or initials fallback)"
    expected: "Partner avatar in split settings shows photo when available, initials otherwise"
    why_human: "Split settings visual display requires human verification"
---

# Phase 10: User Avatar System Verification Report

**Phase Goal:** Save and display user avatars from OAuth providers across the app -- header, split settings, transfers, and account lists. Also introduce avatar-style display for private accounts with customizable background colors.
**Verified:** 2026-04-17T18:10:00Z
**Status:** human_needed
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | OAuth login stores avatar_url in users table and overwrites on every re-login | VERIFIED | `auth_service.go` lines 58-61 and 82-85: `dbUser.AvatarURL = user.AvatarURL` followed by `s.userRepo.Update()` in both existing-social and existing-email branches; `auth_handler.go` lines 93-101: extracts AvatarURL from goth user with empty-string guard |
| 2 | accounts table has avatar_background_color with a non-null default | VERIFIED | Migration `20260417000001` contains `VARCHAR(7) NOT NULL DEFAULT '#457b9d'` |
| 3 | /api/auth/me response includes avatar_url field | VERIFIED | `domain/user.go` has `AvatarURL *string json:"avatar_url,omitempty"`; entity ToDomain/FromDomain mappings present |
| 4 | /api/accounts response includes avatar_background_color and partner data | VERIFIED | `account_repository.go` line 72: Select includes `avatar_background_color`; lines 120, 128: `partner_avatar_url` and `partner_name` in jsonb_build_object |
| 5 | Header avatar shows user's OAuth photo when available, initials when not | VERIFIED | `AppLayout.tsx` imports UserAvatar, passes `avatarUrl={user?.avatar_url}`; no inline initials computation remains |
| 6 | Split settings avatar shows partner's OAuth photo when available, initials when not | VERIFIED | `SplitSettingsFields.tsx` line 214: `src={selectedAccount.user_connection?.partner_avatar_url}`; imports shared `getInitials` |
| 7 | Shared utility getInitials is used everywhere (no duplicate implementations) | VERIFIED | Only one `function getInitials` in entire frontend/src/ (in `utils/getInitials.ts`); AppLayout inline initials removed |
| 8 | UserAvatar and AccountAvatar components exist for reuse | VERIFIED | Both files exist with proper exports, substantive implementations using Mantine Avatar with src + initials fallback |
| 9 | ColorSwatchPicker renders 12 preset colors and emits selected hex | VERIFIED | 12 colors in PRESET_COLORS array, SimpleGrid cols={4} spacing={8}, onClick emits color, aria-labels present |
| 10 | Transfer rows show source->dest avatar pair with tooltips | VERIFIED | `TransactionRow.tsx`: AccountAvatar for fromAccount/toAccount with Tooltip labels, IconArrowRight between them; fromAccount derivation preserved at line 105 |
| 11 | Account cards show AccountAvatar left of account name | VERIFIED | `AccountCard.tsx` imports and renders `<AccountAvatar account={account} size="md" />` |
| 12 | Account form includes ColorSwatchPicker with color persisting through save | VERIFIED | `AccountForm.tsx`: zod schema has `avatar_background_color` with hex regex, ColorSwatchPicker wired via useWatch + setValue; `AccountDrawer.tsx`: initialValues includes `avatar_background_color: account.avatar_background_color ?? '#457b9d'`, payload includes `avatar_background_color: values.avatar_background_color` |

**Score:** 12/12 truths verified

### Frontend Types

| Type | Field | Status |
|------|-------|--------|
| Me (auth.ts) | `avatar_url?: string` | VERIFIED |
| AccountPayload (accounts.ts) | `avatar_background_color: string` | VERIFIED |
| UserConnection (transactions.ts) | `partner_avatar_url?: string`, `partner_name?: string` | VERIFIED |
| Account (transactions.ts) | `avatar_background_color?: string` | VERIFIED |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `backend/migrations/20260417000000_add_avatar_url_to_users.sql` | avatar_url column on users | VERIFIED | Contains ALTER TABLE with TEXT type, goose Up/Down |
| `backend/migrations/20260417000001_add_avatar_background_color_to_accounts.sql` | avatar_background_color with NOT NULL DEFAULT | VERIFIED | VARCHAR(7) NOT NULL DEFAULT '#457b9d' |
| `backend/internal/domain/user.go` | AvatarURL field | VERIFIED | `AvatarURL *string json:"avatar_url,omitempty"` |
| `backend/internal/domain/account.go` | AvatarBackgroundColor field | VERIFIED | `AvatarBackgroundColor *string json:"avatar_background_color,omitempty"` |
| `backend/internal/domain/user_connection.go` | PartnerAvatarURL, PartnerName | VERIFIED | Both *string fields present |
| `backend/internal/entity/user.go` | AvatarURL + ToDomain/FromDomain | VERIFIED | Field + both mappings present |
| `backend/internal/entity/account.go` | AvatarBackgroundColor + mappings | VERIFIED | Field + both mappings present |
| `backend/internal/entity/user_connection.go` | PartnerAvatarURL, PartnerName + mappings | VERIFIED | Both fields with `gorm:"-"` tag + both mappings |
| `backend/internal/handler/auth_handler.go` | Avatar extraction from goth user | VERIFIED | Empty-string guard + pointer assignment |
| `backend/internal/service/auth_service.go` | Avatar update on every login | VERIFIED | Three branches: existing social, new user, existing email -- all set AvatarURL |
| `backend/internal/repository/account_repository.go` | partner_avatar_url in Search, avatar_background_color in Update | VERIFIED | Both present in SQL and Select whitelist |
| `frontend/src/utils/getInitials.ts` | Shared getInitials utility | VERIFIED | Exported function, 11 lines |
| `frontend/src/components/UserAvatar.tsx` | Shared avatar with OAuth photo + fallback | VERIFIED | Uses Mantine Avatar src + getInitials children |
| `frontend/src/components/AccountAvatar.tsx` | Private vs shared account avatar | VERIFIED | Branches on user_connection, uses partner_avatar_url for shared |
| `frontend/src/components/accounts/ColorSwatchPicker.tsx` | 12-swatch color picker | VERIFIED | 12 colors, 4x3 grid, selection ring, aria labels |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| auth_handler.go | auth_service.go | AvatarURL in domainUser | WIRED | `AvatarURL: avatarURL` passed to OAuthCallback |
| auth_service.go | user_repository.go | userRepo.Update saves avatar | WIRED | `s.userRepo.Update(ctx, dbUser)` after setting AvatarURL in both existing-user branches |
| account_repository.go | domain/user_connection.go | partner_avatar_url SQL -> PartnerAvatarURL | WIRED | SQL correlated subquery maps to domain field via entity JSON scan |
| AppLayout.tsx | UserAvatar.tsx | import + user.avatar_url | WIRED | Import present, `avatarUrl={user?.avatar_url}` passed |
| SplitSettingsFields.tsx | getInitials.ts | import replacing local function | WIRED | `import { getInitials } from "@/utils/getInitials"`, no local function |
| TransactionRow.tsx | AccountAvatar.tsx | import for AccountCell | WIRED | Import present, used for fromAccount, toAccount, and account |
| AccountCard.tsx | AccountAvatar.tsx | import for account display | WIRED | Import present, `<AccountAvatar account={account} size="md" />` |
| AccountForm.tsx | ColorSwatchPicker.tsx | import for color field | WIRED | Import present, wired via useWatch + setValue |
| AccountForm.tsx | accounts.ts | avatar_background_color in schema | WIRED | Zod schema includes hex-validated field |
| AccountDrawer.tsx | AccountForm.tsx | initialValues + payload include color | WIRED | Both initialValues (edit mode) and payload (save) include avatar_background_color |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| UserAvatar.tsx | avatarUrl prop | user.avatar_url from /api/auth/me | DB query via userRepo.GetByID -> domain.User.AvatarURL | FLOWING |
| AccountAvatar.tsx | partner_avatar_url | account.user_connection from /api/accounts | SQL correlated subquery on users table | FLOWING |
| AccountAvatar.tsx | avatar_background_color | account from /api/accounts | DB column with NOT NULL DEFAULT | FLOWING |
| ColorSwatchPicker.tsx | value prop | useWatch on avatar_background_color | Form state from RHF, persisted via AccountDrawer payload | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Go backend compiles | `cd /workspace/backend && go build ./...` | Exit 0, no errors | PASS |
| TypeScript compiles | `cd /workspace/frontend && npx tsc --noEmit` | Exit 0, no errors | PASS |
| No duplicate getInitials | `grep -r "function getInitials" frontend/src/` | Only utils/getInitials.ts | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| AVA-01 | 10-01 | Save avatar URL from OAuth provider on login | SATISFIED | Migration adds column; auth handler extracts from goth; service updates on every login |
| AVA-02 | 10-02 | Display user avatar in top header menu | SATISFIED | AppLayout uses UserAvatar with avatar_url; inline initials removed |
| AVA-03 | 10-02 | Show avatars in split settings connection list | SATISFIED | SplitSettingsFields uses partner_avatar_url src prop |
| AVA-04 | 10-03 | Show transfer indication as avatar->avatar in transaction list | SATISFIED | TransactionRow AccountCell: AccountAvatar pair with IconArrowRight and Tooltips |
| AVA-05 | 10-03 | Migrate account column in transaction list to always show avatar | SATISFIED | Non-transfer branch shows single AccountAvatar with Tooltip |
| AVA-06 | 10-01, 10-02, 10-03 | Allow user to set background color for private account avatars | SATISFIED | Migration adds column; AccountForm has ColorSwatchPicker with hex validation; AccountDrawer wires payload |
| AVA-07 | 10-03 | Show avatar in account list (shared = connected user avatar) | SATISFIED | AccountCard uses AccountAvatar; shared accounts show partner photo via partner_avatar_url |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none found) | - | - | - | - |

No TODO, FIXME, placeholder, or stub patterns found in any phase artifacts.

### Human Verification Required

### 1. OAuth Avatar Display in Header

**Test:** Log in via OAuth (Google) and verify profile photo appears in top-right header avatar
**Expected:** OAuth profile photo displayed at 26px circular avatar; falls back to initials if no photo available
**Why human:** External OAuth photo URL rendering and image loading fallback require visual inspection

### 2. Transaction Row Avatars with Tooltips

**Test:** Open Transactions page, verify account column shows circular avatars (20px), hover to see tooltip with account name
**Expected:** Avatars replace text names; tooltip appears on hover with correct account name
**Why human:** Tooltip interaction timing, avatar rendering, and visual layout require human testing

### 3. Transfer Row Avatar Pair

**Test:** Find a transfer transaction, verify [source avatar] -> [dest avatar] horizontal layout
**Expected:** Two avatars with right-arrow between them; correct direction (source left, destination right)
**Why human:** Transfer direction correctness is a critical visual/UX requirement

### 4. Account Card Avatars

**Test:** Open Accounts page, verify avatar appears left of each account name
**Expected:** Private accounts show initials with colored background (38px); shared accounts show partner OAuth photo
**Why human:** Visual distinction between private and shared account avatars requires human judgment

### 5. Color Picker in Account Form

**Test:** Create or edit an account; verify 12-swatch color picker appears; pick a color, save, reopen to verify persistence
**Expected:** "Cor do avatar" label, 4x3 grid, selected color has blue ring, color persists through save/reload
**Why human:** Form interaction flow, visual selection state, and persistence across save cycle require manual testing

### 6. Split Settings Partner Avatar

**Test:** Open a transaction with split settings, verify partner avatar display
**Expected:** Partner's OAuth photo shown when available; initials fallback otherwise
**Why human:** Visual rendering in split settings context requires human verification

### Gaps Summary

No code-level gaps found. All 12 observable truths verified against the actual codebase. All 7 AVA requirements have supporting implementation evidence across backend and frontend. Both Go and TypeScript compile cleanly. No anti-patterns, stubs, or placeholders detected.

The phase requires human verification for visual/interaction testing of avatar rendering, tooltip behavior, color picker UX, and OAuth photo display across all app locations.

---

_Verified: 2026-04-17T18:10:00Z_
_Verifier: Claude (gsd-verifier)_
