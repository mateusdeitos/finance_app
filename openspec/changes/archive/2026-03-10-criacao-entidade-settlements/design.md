## Context

The app allows connected users to split expenses and incomes. When User1 creates an R$500 expense and splits 50% with User2, two transactions exist: one for User1 (R$500) and one for User2 (R$250). Without a settlement, User1's account balance would be debited the full R$500 even though User2 owes R$250 back. Settlements are offsetting entries that bring User1's effective balance to -R$250.

Existing infrastructure: `domain`, `entity`, `repository`, and `service` layers are well-established.

## Goals / Non-Goals

**Goals:**
- Introduce a `Settlement` domain model with a new `SettlementType` enum (credit/debit) and `amount` (cents)
- GORM entity with FK constraints to `users`, `accounts`, and `transactions` (two FKs: `source_transaction_id` and `parent_transaction_id`, both with `ON DELETE CASCADE ON UPDATE CASCADE`)
- Repository interface: `Search`, `Create`, `Update`, `Delete`
- Service interface: `Search`, `SearchOne`, `Create`, `Update`, `Delete`
- SQL migration to create the `settlements` table
- Wire up the new repository and service in `cmd/server/main.go`
- Regenerate mocks after adding interfaces
- `TransactionFilter` gains an optional `WithSettlements bool` flag so callers can request settlement data alongside transactions

**Non-Goals:**
- HTTP handler endpoints (not in scope for this change)
- Automatic settlement creation/update/delete triggered by transaction service (follow-on work)
- Settlement balance aggregation or reporting endpoints

## Decisions

### New `SettlementType` enum (credit/debit)
Although the values mirror `OperationType`, settlements have a distinct semantic: they represent balance adjustments from shared transactions, not direct income/expense operations. A dedicated `SettlementType` keeps the domain clean and avoids coupling settlement logic to transaction operation semantics.

**Alternatives considered:** Reusing `OperationType` — rejected to maintain clear domain boundaries; the two concepts may diverge in the future.

### Two transaction FK columns: `source_transaction_id` and `parent_transaction_id`
- `source_transaction_id` — references the settlement owner's (User1's) original transaction. Allows tracing which entry on the author's side generated the settlement.
- `parent_transaction_id` — references the counterpart's (User2's) transaction. This is the split entry that drives the settlement amount and lifecycle.

Both FKs are defined with `ON DELETE CASCADE ON UPDATE CASCADE`, so deleting or updating either transaction automatically removes or updates the linked settlement without manual cleanup.

Having both references makes it possible to look up settlements either from the author's transaction or from the split entry without additional joins.

**Alternatives considered:** Single FK (`parent_transaction_id` only) — rejected because it made it impossible to efficiently query "settlements attached to my transactions" from the owner's side.

### `SettlementFilter` for Search
Follows the pattern established by `TransactionFilter`, `AccountSearchOptions`, etc. Supports filtering by `UserIDs`, `AccountIDs`, `TransactionIDs`, `IDs`, with `Limit`/`Offset` for pagination.

### No soft-delete on settlements
Transactions use soft-delete (`deleted_at`) because they have recurrence relationships that need tombstone records. Settlements are simpler adjuncts — hard delete is sufficient and keeps queries cleaner.

## Risks / Trade-offs

- [Risk] Settlement data can drift out of sync with transactions if the transaction service does not create/update/delete settlements atomically → Mitigation: the settlement service CRUD operations will be called explicitly inside DB transactions by the transaction service in follow-on work; the interfaces are designed to accept a `context.Context` that already carries the DB transaction.
- [Risk] Missing index on `parent_transaction_id` and `source_transaction_id` could cause slow look-ups → Mitigation: migration includes indexes on both FK columns and `user_id`.

## Migration Plan

1. Add `migrations/<timestamp>_create_settlements_table.sql` with `CREATE TABLE settlements` and FK constraints.
2. Add `internal/domain/settlement.go`, `internal/entity/settlement.go`.
3. Add `internal/repository/settlement_repository.go` and update `interfaces.go` + `Repositories` struct.
4. Add `internal/service/settlement_service.go` and update `interfaces.go` + `Services` struct.
5. Wire in `cmd/server/main.go`.
6. Run `just generate-mocks`.
7. Apply migration on staging; verify FK constraints.
