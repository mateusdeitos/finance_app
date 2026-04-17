---
phase: 10-user-avatar-system
plan: 01
subsystem: backend-avatar-infrastructure
tags: [avatar, oauth, migration, domain, entity, repository, service, handler]
dependency_graph:
  requires: []
  provides: [avatar_url_column, avatar_background_color_column, partner_avatar_sql, auth_avatar_extraction]
  affects: [auth_handler, auth_service, account_repository, domain_user, domain_account, domain_user_connection]
tech_stack:
  added: []
  patterns: [nullable_pointer_string_for_optional_fields, jsonb_subquery_for_partner_data]
key_files:
  created:
    - backend/migrations/20260417000000_add_avatar_url_to_users.sql
    - backend/migrations/20260417000001_add_avatar_background_color_to_accounts.sql
  modified:
    - backend/internal/domain/user.go
    - backend/internal/domain/account.go
    - backend/internal/domain/user_connection.go
    - backend/internal/entity/user.go
    - backend/internal/entity/account.go
    - backend/internal/entity/user_connection.go
    - backend/internal/handler/auth_handler.go
    - backend/internal/service/auth_service.go
    - backend/internal/repository/account_repository.go
decisions:
  - "Used *string for AvatarURL to store NULL when provider returns empty string (D-02/Pitfall 2)"
  - "Used correlated subqueries in jsonb_build_object for partner_avatar_url and partner_name to avoid additional JOINs"
metrics:
  duration: 171s
  completed: "2026-04-17T17:43:51Z"
  tasks_completed: 2
  tasks_total: 2
  files_created: 2
  files_modified: 9
---

# Phase 10 Plan 01: Backend Avatar Infrastructure Summary

Backend migrations, domain/entity fields, auth avatar extraction, and account repository extensions for the user avatar system with partner data in shared account queries.

## Task Results

| Task | Name | Commit | Status |
|------|------|--------|--------|
| 1 | Migrations + Domain + Entity layer | 99b4c5a | Done |
| 2 | Auth handler + service avatar extraction, account repo extensions | 2855bb8 | Done |

## Changes Made

### Task 1: Migrations + Domain + Entity layer
- Created migration adding nullable `avatar_url TEXT` column to `users` table
- Created migration adding `avatar_background_color VARCHAR(7) NOT NULL DEFAULT '#457b9d'` to `accounts` table (all existing accounts get steel blue default)
- Added `AvatarURL *string` to domain and entity User structs with ToDomain/FromDomain mappings
- Added `AvatarBackgroundColor *string` to domain and entity Account structs with mappings
- Added `PartnerAvatarURL *string` and `PartnerName *string` to domain and entity UserConnection structs (populated only by account Search SQL, not stored in user_connections table)

### Task 2: Auth handler + service + account repo
- Extracted `AvatarURL` from goth user in OAuthCallback handler with empty-string-to-nil guard (stores NULL not empty string)
- Added avatar overwrite on every OAuth login for existing social accounts (D-02 decision)
- Included AvatarURL in new user creation struct
- Added avatar update for existing-email users linking a new social provider
- Added `avatar_background_color` to account Update method's Select whitelist (Pitfall 1 prevention)
- Extended account Search SQL jsonb_build_object with correlated subqueries for `partner_avatar_url` and `partner_name`, using CASE WHEN to resolve the partner user based on which side of the connection the requesting user is on

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None - all data paths are fully wired.

## Verification

- `go build ./...` passes
- `just test-unit` passes (all existing unit tests green)
- Migration files follow goose Up/Down pattern
- AvatarURL field confirmed in domain/entity/handler/service
- partner_avatar_url and avatar_background_color confirmed in account repository

## Self-Check: PASSED
