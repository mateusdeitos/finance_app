# Phase 10: User Avatar System - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-17
**Phase:** 10-user-avatar-system
**Areas discussed:** Avatar storage & update, Account visual identity, Transfer display in tx list, Avatar across touchpoints

---

## Avatar Storage & Update

| Option | Description | Selected |
|--------|-------------|----------|
| Users table | Add avatar_url column to users table. Simple, one query. Updated on every OAuth login. | ✓ |
| User socials table | Add avatar_url to user_socials. Keeps OAuth data together but needs JOIN. |  |

**User's choice:** Users table
**Notes:** None

| Option | Description | Selected |
|--------|-------------|----------|
| Every login | Overwrite avatar_url on each OAuth callback. Always fresh. | ✓ |
| Only on first login | Set once, never update. |  |

**User's choice:** Every login
**Notes:** None

| Option | Description | Selected |
|--------|-------------|----------|
| Initials fallback | On image error, fall back to existing initials avatar. | ✓ |
| Default placeholder icon | Show generic person icon. |  |

**User's choice:** Initials fallback
**Notes:** None

---

## Account Visual Identity

| Option | Description | Selected |
|--------|-------------|----------|
| User picks color | Color picker in account form. Stored as hex. | ✓ |
| Auto-assigned from palette | System assigns color by index/hash. |  |
| Fixed single color | All accounts use same color (blue). |  |

**User's choice:** User picks color
**Notes:** None

| Option | Description | Selected |
|--------|-------------|----------|
| First letter only | "Nubank" → "N", "Cartão Visa" → "C" |  |
| First two words' initials | "Nubank" → "N", "Cartão Visa" → "CV" | ✓ |

**User's choice:** First two words' initials
**Notes:** None

| Option | Description | Selected |
|--------|-------------|----------|
| Connected user's avatar | Show partner's OAuth avatar/initials. | ✓ |
| Account initials with badge | Same initials with sharing indicator. |  |

**User's choice:** Connected user's avatar
**Notes:** None

| Option | Description | Selected |
|--------|-------------|----------|
| Mantine ColorSwatch preset palette | Grid of ~12-16 preset colors. | ✓ |
| Full Mantine ColorPicker | Hue slider + saturation area + hex input. |  |
| You decide | Claude picks. |  |

**User's choice:** Mantine ColorSwatch preset palette
**Notes:** None

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-assign on migration | Migration sets default color for existing accounts. | ✓ |
| Null = fallback to blue | Existing accounts show blue until user edits. |  |

**User's choice:** Auto-assign on migration
**Notes:** None

---

## Transfer Display in Transaction List

| Option | Description | Selected |
|--------|-------------|----------|
| Replace account text with avatars | [source] → [dest] avatars, tooltip for account name. | ✓ |
| Avatars below account name | Keep text, add avatar row below. |  |
| You decide | Claude picks. |  |

**User's choice:** Replace account text with avatars
**Notes:** User clarified: add tooltip with account text. On mobile, tapping the avatar should show the tooltip as well.

| Option | Description | Selected |
|--------|-------------|----------|
| Avatar + name | All transactions show [avatar] Account Name. |  |
| Avatar only, tooltip for name | Avatar replaces text, tooltip shows name. | ✓ |
| Text only for non-transfers | Keep current text display. |  |

**User's choice:** Avatar only, tooltip for name
**Notes:** Consistent with transfer display pattern.

---

## Avatar Across Touchpoints

| Option | Description | Selected |
|--------|-------------|----------|
| Contextual sizes | Header sm, Tx rows xs, Account list md, Split settings sm. | ✓ |
| Uniform size | Same size everywhere. |  |

**User's choice:** Contextual sizes
**Notes:** None

| Option | Description | Selected |
|--------|-------------|----------|
| Avatar left of account name | Card shows [avatar] Account Name. | ✓ |
| Large avatar as card header | Big centered avatar at top of card. |  |

**User's choice:** Avatar left of account name
**Notes:** None

| Option | Description | Selected |
|--------|-------------|----------|
| Replace initials with OAuth avatar | Swap to photo when available, initials fallback. | ✓ |
| Keep initials only | Don't change split settings. |  |

**User's choice:** Replace initials with OAuth avatar
**Notes:** None

---

## Claude's Discretion

- Migration naming and timestamp conventions
- Exact preset color palette for ColorSwatch
- Avatar component wrapper abstraction decisions
- Tooltip trigger timing and positioning

## Deferred Ideas

None — discussion stayed within phase scope
