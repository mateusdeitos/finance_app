## 1. Domain Model

- [x] 1.1 Create `internal/domain/settlement.go` with `SettlementType` enum (credit/debit) and `Settlement` struct
- [x] 1.2 Create `SettlementFilter` struct in `internal/domain/settlement.go`

## 2. Database Migration

- [x] 2.1 Create Goose migration `migrations/<timestamp>_create_settlements_table.sql` with table, FK constraints (ON DELETE CASCADE ON UPDATE CASCADE on both transaction FKs), and indexes

## 3. GORM Entity

- [x] 3.1 Create `internal/entity/settlement.go` with `Settlement` GORM struct, `BeforeCreate`/`BeforeUpdate` hooks, `ToDomain()` and `SettlementFromDomain()` methods

## 4. Repository

- [x] 4.1 Create `internal/repository/settlement_repository.go` implementing `Search`, `Create`, `Update`, `Delete`
- [x] 4.2 Add `SettlementRepository` interface to `internal/repository/interfaces.go` and add `Settlement` field to `Repositories` struct

## 5. Service

- [x] 5.1 Create `internal/service/settlement_service.go` implementing `Search`, `SearchOne`, `Create`, `Update`, `Delete`
- [x] 5.2 Add `SettlementService` interface to `internal/service/interfaces.go` and add `Settlement` field to `Services` struct

## 6. Wiring & Mocks

- [x] 6.1 Instantiate `SettlementRepository` and `SettlementService` in `cmd/server/main.go`
- [x] 6.2 Run `just generate-mocks` to regenerate mocks for the new interfaces
