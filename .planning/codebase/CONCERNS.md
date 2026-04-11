# Codebase Concerns

**Analysis Date:** 2026-04-09

## Tech Debt

**Password Reset Token Storage — In-Memory Implementation:**
- Issue: Password reset tokens stored in a plain `map[string]passwordResetToken` in `authService` (line 19 in `auth_service.go`). Tokens lost on server restart, no TTL enforcement beyond `ExpiresAt` checking at validation time, no audit trail.
- Files: `internal/service/auth_service.go`
- Impact: Any server restart clears all pending password reset tokens, making recovery UX fail. No scalability path for multi-instance deployments. If user never uses reset token and server restarts, token never actually expires from memory.
- Fix approach: Migrate to persistent storage (Redis or database table) with TTL support. Add index on token expiration for cleanup. Add audit logs for token generation/consumption.

**Soft Delete Inconsistency — Incomplete Filtering:**
- Issue: Soft deletes via `deleted_at` column used on transactions, but not consistently enforced across all queries. Repository queries explicitly check `deleted_at IS NULL` in some places (`transaction_repository.go` line 207) but queries via `preload` may include deleted rows depending on GORM configuration.
- Files: `internal/repository/transaction_repository.go`, `internal/entity/transaction.go`
- Impact: Risk of deleted transactions appearing in balance calculations or search results after deletion. Race conditions possible if concurrent operations check deleted status.
- Fix approach: Enforce default GORM hooks to exclude soft-deleted rows on all queries. Add integration tests verifying deleted transactions never appear in any query. Consider audit logging for deletions.

**Circular Service Dependencies:**
- Issue: Some services (`TransactionService`, `UserConnectionService`) depend on the `Services` struct itself for cross-service calls (lines 85-86 in `cmd/server/main.go`). Creates initialization order coupling and makes testing more complex.
- Files: `cmd/server/main.go`, `internal/service/transaction_service.go`, `internal/service/user_connection_service.go`
- Impact: Harder to test individual services in isolation, risk of nil pointer if service wiring order changes. Makes service interfaces less clear about dependencies.
- Fix approach: Extract specific interfaces needed (e.g., `AccountService`, `SettlementService`) and depend on interfaces instead of full `Services` struct. Use interface-based injection.

## Known Bugs

**Floating Point Division in Split Calculations:**
- Issue: When splitting expenses by percentage, integer division may occur with loss of precision. Example: 100 cents split 50/50 between two users = 50 + 50, but for odd amounts like 101, could result in 50 + 50 = 100 instead of 51 + 50.
- Files: `internal/service/transaction_create.go`, `internal/service/transaction_import.go`
- Trigger: Create expense with odd amount and 50% split. Check linked transaction amounts don't sum to original.
- Workaround: Currently stores amounts as `int64` in cents, but logic needs verification for rounding behavior. Check implementation of split amount calculation.

**Transaction Update Complex State Machine — High Complexity Risk:**
- Issue: `transaction_update.go` (1,036 lines) implements a complex state machine for updating transaction type, recurrence, and split settings with 3 propagation modes. Nested scenario handling with 16+ update scenarios makes it easy to miss edge cases.
- Files: `internal/service/transaction_update.go` (especially `determineTypeUpdateScenario` at line 162)
- Trigger: Update transaction changing type AND recurrence AND split settings with `propagation=current_and_future`
- Workaround: Heavy test coverage exists (`transaction_update_test.go` 3,585 lines) but scenario #17+ not yet implemented per spec
- Risk: Unimplemented scenarios, incorrect transaction state after complex updates, orphaned recurrence records

## Security Considerations

**JWT Validation — Missing Claims Validation:**
- Risk: JWT token validated for signing method and `user_id` claim, but no validation of `exp` (expiration) claim is explicitly checked. Relies on `jwt.Parse()` internal validation which may not be obvious.
- Files: `internal/service/auth_service.go` (lines 131-166, specifically line 143 checking `token.Valid`)
- Current mitigation: `token.Valid` should include expiration check, but should be explicit. No `aud` (audience) or `iss` (issuer) claims configured.
- Recommendations: Add explicit `exp` claim extraction and comparison to `time.Now()`. Add `iss` (issuer) claim to token generation and validation. Consider `aud` (audience) for multi-service deployments.

**Missing Rate Limiting on Auth Endpoints:**
- Risk: No rate limiting on login, password reset, or OAuth callback endpoints. Brute force attacks possible on email/password endpoints. OAuth endpoints could be abused.
- Files: `internal/handler/auth_handler.go`
- Current mitigation: None detected
- Recommendations: Add rate limiting middleware per IP for auth endpoints. Implement exponential backoff after N failed attempts per email. Monitor and log suspicious patterns.

**Insufficient Input Validation on Category/Tag Operations:**
- Risk: User can create categories or tags with minimal validation. Empty strings, very long strings, SQL-like strings not validated.
- Files: `internal/handler/category_handler.go`, `internal/handler/tag_handler.go`
- Current mitigation: Database constraints exist but error messages may leak schema info
- Recommendations: Add comprehensive input validation in handlers before reaching repository layer. Sanitize string lengths. Test with fuzzing.

## Performance Bottlenecks

**N+1 Query Problem in Transaction Search:**
- Problem: `transaction_repository.go` line 91 preloads `LinkedTransactions`, `Tags`, and `SourceTransactions` for every transaction. For search with 100 transactions, this causes multiple queries per relationship type.
- Files: `internal/repository/transaction_repository.go` (line 91)
- Cause: Multiple `Preload()` calls on search queries without optimization. GORM executes separate queries for each relationship.
- Improvement path: Use `Joins()` with explicit `SELECT` to fetch in single query, or implement pagination with smaller result sets. Add database indexes on `linked_transactions` and `transaction_tags` tables.

**Inefficient Settlement Sync on Every Transaction Update:**
- Problem: `syncSettlementsForTransaction()` called for each transaction in update operation (line 147 in `transaction_update.go`). For bulk operations on 100+ installments, this causes O(n) settlement recalculations.
- Files: `internal/service/transaction_update.go` (line 147)
- Cause: Settlement logic inside transaction loop rather than batched.
- Improvement path: Collect all transaction changes, then compute settlements once. Add batch settlement sync API. Cache settlement calculations.

**Balance Calculation Scan of All Transactions:**
- Problem: `getBalance()` in `transaction_repository.go` line 207 uses raw SQL that scans from transaction creation date to query date. For accounts with years of history, this is slow.
- Files: `internal/repository/transaction_repository.go` (line 207)
- Cause: No balance caching or rolling calculation
- Improvement path: Maintain materialized balance snapshots (e.g., monthly). Cache recent balance in account record. Add database partition on transactions by year.

## Fragile Areas

**Transaction Delete with Recurrence — Manual State Management:**
- Files: `internal/service/transaction_delete.go` (entire file)
- Why fragile: Manual deletion of recurrence records, linked transactions, and settlements with error recovery via rollback. Missing one table causes orphans. Complex query order for soft deletes.
- Safe modification: Add comprehensive test for every propagation setting + recurrence combo. Use database triggers to cascade delete settlements when transactions deleted. Always test with real database, not mocks.
- Test coverage: `transaction_delete_test.go` (741 lines) covers main paths but edge cases with orphaned recurrences and settlements not exhaustively tested.

**User Connection Lifecycle — Implicit State Transitions:**
- Files: `internal/service/user_connection_service.go` (especially lines 31-88 for `Create`)
- Why fragile: User connections have `pending`, `accepted`, `rejected` states with implicit transitions on operations. Acceptance of connection may trigger settlement calculations. Rejection without cleanup may leave linked transactions.
- Safe modification: Add state machine validation before every operation. Test all state transition paths. Ensure settlement cleanup on rejection tested.
- Test coverage: Limited test coverage for `UserConnectionService` — no integration tests visible for state transitions.

**Category Deletion with Transaction References:**
- Files: `internal/service/category_service.go` (lines 157-203 for `Delete`)
- Why fragile: Deleting category requires moving transactions to replacement category. No validation that replacement category is actually valid before update. No rollback on partial failure.
- Safe modification: Wrap in transaction, validate replacement exists before deleting original, test cascade behavior. Add tests for orphaned transaction detection.
- Test coverage: No visible test file for category service operations.

## Test Coverage Gaps

**HTTP Handlers — No Test Coverage:**
- What's not tested: All HTTP handlers for transactions, accounts, categories, tags, users, connections, and auth have **zero test coverage**. No integration tests, no mocking of services.
- Files: 
  - `internal/handler/transaction_handler.go` (393 lines) — untested
  - `internal/handler/account_handler.go` (untested)
  - `internal/handler/category_handler.go` (untested)
  - `internal/handler/auth_handler.go` (untested)
  - `internal/handler/user_connection_handler.go` (untested)
  - `internal/handler/tag_handler.go` (untested)
- Risk: Request/response marshaling bugs, error handler logic, middleware integration, path validation all untested. Swagger docs may be wrong. Missing auth checks could expose endpoints.
- Priority: **High** — Handlers are the public API boundary

**Service Integration — Limited Multi-Service Tests:**
- What's not tested: Cross-service operations like `UserConnectionService` calling `TransactionService` or account deletion triggering transaction updates. Only single-service tests exist.
- Files: `internal/service/` — Test files only for transaction operations
- Risk: Service integration bugs not caught until production
- Priority: **High**

**Settlement Calculation Edge Cases:**
- What's not tested: Settlement calculations with zero-amount splits, negative amounts, multi-party settlements, settlement cleanup on transaction deletion
- Files: `internal/service/settlement_service.go` — no test file
- Risk: Settlement math errors, orphaned settlement records
- Priority: **Medium**

**Tag and Category Service Operations:**
- What's not tested: Tag creation/deletion, category merging, bulk operations
- Files: `internal/service/tag_service.go`, `internal/service/category_service.go` — no test files
- Risk: Data corruption on category deletion, duplicate tags, orphaned category IDs
- Priority: **Medium**

**CSV Import Edge Cases:**
- What's not tested: Malformed CSV, invalid dates, duplicate transactions, partial failure recovery
- Files: `internal/service/transaction_import.go` — partial test coverage (453 lines in test file) but not exhaustive
- Risk: Import failures leave partial data, confusing users
- Priority: **Medium**

## Scaling Limits

**In-Memory Service State:**
- Current capacity: Single server instance only. Password reset tokens stored in map.
- Limit: Cannot scale to multiple backend instances or containerized environments
- Scaling path: Move password reset tokens to Redis or database. Ensure all service state is stateless.

**Database Query Performance:**
- Current capacity: Application works with thousands of transactions, but N+1 queries degrade with volume
- Limit: Search performance degrades O(n) with transaction count after 10k+ transactions
- Scaling path: Implement query optimization (see Performance Bottlenecks section), add caching layer (Redis), partition transactions by date

**Transaction Update Complexity:**
- Current capacity: Updates to single transaction work fine, but bulk updates (e.g., "update all future installments") are sequential
- Limit: Updating 1000 installments takes O(n) time due to syncSettlementsForTransaction loop
- Scaling path: Batch settlement calculation, implement bulk update operations, add async job queue for heavy operations

## Dependencies at Risk

**GORM Soft Delete Behavior Uncertainty:**
- Risk: GORM soft delete behavior may change between versions. Relying on `deleted_at IS NULL` filtering is fragile if GORM config changes.
- Impact: Deleted transactions could reappear or be excluded unexpectedly
- Migration plan: Abstract soft delete logic into custom repository methods. Add integration tests verifying behavior after every GORM upgrade. Consider explicit database-level constraints.

**JWT Library Version Lock:**
- Risk: Using `github.com/golang-jwt/jwt/v5` — no explicit version pinning in token validation. Algorithm could be vulnerable to future exploits.
- Impact: Token validation could be bypassed if library has security bug
- Migration plan: Pin to specific patch version. Add security scanning to CI pipeline. Monitor CVE databases for JWT library.

## Missing Critical Features

**Audit Logging:**
- Problem: No audit trail for transaction modifications, user operations, or sensitive actions. Cannot trace who deleted what or when.
- Blocks: Compliance with financial audit requirements, debugging user-reported discrepancies
- Implementation: Add audit log table, log all CRUD operations with user ID and timestamp, add audit search endpoints

**Concurrent Operation Handling:**
- Problem: No optimistic locking or version fields on transactions. Concurrent updates may lose changes.
- Blocks: Multi-device or multi-user editing without manual conflict resolution
- Implementation: Add version field to transactions, implement optimistic locking on update, return conflict error with latest state

**Email Notifications:**
- Problem: Password reset tokens generated but never sent to users. Connection invitations have no notification.
- Blocks: User account recovery, connection workflow completion
- Implementation: Integrate email service (SendGrid, AWS SES), add email templates, queue async email delivery

**Data Retention Policies:**
- Problem: No automatic cleanup of old deleted records, reset tokens, or expired sessions.
- Blocks: GDPR right-to-be-forgotten, data privacy compliance
- Implementation: Add retention policy configuration, implement scheduled cleanup jobs, add data export endpoints

---

*Concerns audit: 2026-04-09*
