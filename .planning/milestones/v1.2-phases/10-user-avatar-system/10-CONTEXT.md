# Phase 10: User Avatar System - Context

**Gathered:** 2026-04-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Save user avatar URLs from OAuth providers and display visual identity (avatars) across the entire app: header menu, transaction list, account list, and split settings. Also introduce account-level avatars with user-customizable background colors and initials for private accounts.

</domain>

<decisions>
## Implementation Decisions

### Avatar Storage & Update
- **D-01:** Add `avatar_url` column to `users` table (not user_socials). Simple, one query, no JOINs needed.
- **D-02:** Overwrite `avatar_url` on every OAuth login callback. Always fresh from provider.
- **D-03:** Fallback to initials when avatar URL fails to load. Mantine Avatar children (initials) already serve as fallback when `src` errors — zero extra work.

### Account Visual Identity
- **D-04:** User picks account avatar background color from a Mantine ColorSwatch preset palette (grid of ~12-16 colors). Stored as hex in `accounts` table.
- **D-05:** Account initials use first letter of first two words. "Nubank" → "N", "Cartão Visa" → "CV".
- **D-06:** Shared accounts display the connected user's OAuth avatar (partner's photo). Falls back to partner's initials if no avatar URL.
- **D-07:** Migration auto-assigns a default color to all existing accounts. No null state in frontend.

### Transfer Display in Transaction List
- **D-08:** Transfer rows replace account text with avatars: [source avatar] → [dest avatar]. Account names shown via Mantine Tooltip on hover (desktop) and tap (mobile).
- **D-09:** Non-transfer transaction rows also show avatar only (no account name text), with tooltip for account name on hover/tap. Consistent pattern across all transaction types.

### Avatar Sizing
- **D-10:** Contextual sizes per location: Header `sm` (26px), Transaction rows `xs` (20px), Account list `md` (38px), Split settings `sm` (26px).

### Account List Display
- **D-11:** Account cards show avatar left of account name. Private accounts = initials + user-picked color. Shared accounts = partner's OAuth avatar.

### Split Settings
- **D-12:** Replace current hardcoded initials with OAuth avatar photo when available. Keep initials as fallback. Existing Avatar component in SplitSettingsFields just needs `src` prop added.

### Non-Optimistic Pattern
- **D-13:** (Carried from Phase 8) No optimistic updates for financial state transitions.

### Claude's Discretion
- Migration naming and timestamp conventions
- Exact preset color palette selection for ColorSwatch
- Avatar component wrapper abstraction (if worth creating a shared component vs inline)
- Tooltip trigger timing and positioning details

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Backend - User & Auth
- `backend/internal/domain/user.go` — User domain model (add avatar_url field)
- `backend/internal/entity/user.go` — User ORM entity with ToDomain/FromDomain conversions
- `backend/internal/handler/auth_handler.go` — OAuth callback handler (line 88: goth user, lines 93-96: extract fields)
- `backend/internal/service/auth_service.go` — OAuthCallback logic (lines 50-93: create/update user)
- `backend/pkg/oauth/goth.go` — OAuth provider setup (Google profile scope, Microsoft User.Read scope)

### Backend - Account
- `backend/internal/domain/account.go` — Account domain model (add avatar_background_color field)
- `backend/internal/entity/account.go` — Account ORM entity with conversions
- `backend/migrations/20260318000000_add_external_id_to_users.sql` — Pattern for column addition migrations

### Frontend - User & Auth
- `frontend/src/api/auth.ts` — Me type definition (add avatar_url) and fetchMe function
- `frontend/src/hooks/useMe.ts` — useMe hook for current user data
- `frontend/src/components/AppLayout.tsx` — Header avatar display (lines 36-43: initials calc, line 75: Avatar component)

### Frontend - Transaction Display
- `frontend/src/components/transactions/TransactionRow.tsx` — Transaction row component (lines 32-68: account cell, lines 49-60: transfer display)
- `frontend/src/types/transactions.ts` — Account type (lines 28-38), UserConnection type (lines 15-26)

### Frontend - Account
- `frontend/src/components/accounts/AccountCard.tsx` — Account card component (lines 12-51)
- `frontend/src/routes/_authenticated.accounts.tsx` — Accounts page with grouping logic

### Frontend - Split Settings
- `frontend/src/components/transactions/form/SplitSettingsFields.tsx` — Split settings with Avatar (lines 34-40: getInitials, lines 215-220: Avatar component)

### Frontend - Patterns
- `frontend/src/utils/renderDrawer.tsx` — Drawer opening pattern
- `frontend/src/routes/_authenticated.connect-with.$externalId.tsx` — Another avatar usage reference (invite page)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `Mantine Avatar` — Already used in AppLayout, SplitSettingsFields, and invite page. Supports `src` for image URL with children as fallback.
- `Mantine Tooltip` — Available for hover/tap account name display.
- `Mantine ColorSwatch` — Available for color palette picker.
- `getInitials()` — Exists in SplitSettingsFields (lines 34-40) and AppLayout (lines 36-43). Should be unified.
- Goth `user.AvatarURL` — Available from Google and Microsoft OAuth providers, just not extracted yet.

### Established Patterns
- Avatar with initials fallback: already the pattern in 3 places (AppLayout, SplitSettingsFields, invite page)
- All UI labels in Portuguese (pt-BR)
- Non-optimistic mutations for financial data
- Column addition migrations follow pattern in `20260318000000_add_external_id_to_users.sql`

### Integration Points
- `auth_handler.go` line 88: `gothic.CompleteUserAuth()` returns goth.User with AvatarURL field — just needs extraction
- `auth_service.go` OAuthCallback: needs avatar_url parameter to store on create/update
- `/api/auth/me` endpoint: needs to return avatar_url in response
- TransactionRow: account cell (lines 32-68) needs complete rewrite from text to avatar+tooltip
- AccountCard: needs avatar added left of account name

</code_context>

<specifics>
## Specific Ideas

- Transfer display: [source avatar] → [dest avatar] with Mantine Tooltip on each avatar showing account name
- Mobile tooltip: tap avatar to show tooltip (Mantine Tooltip supports touch events)
- Non-transfer rows: same avatar-only pattern with tooltip, consistent with transfers
- Account color picker: ColorSwatch grid in account create/edit form
- Shared account avatar: show partner's OAuth photo, not account initials
- Split settings: minimal change — add `src={connection.user.avatar_url}` to existing Avatar

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 10-user-avatar-system*
*Context gathered: 2026-04-17*
