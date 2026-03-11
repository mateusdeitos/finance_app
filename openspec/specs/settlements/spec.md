## Requirements

### Requirement: Settlement entity definition
The system SHALL define a `Settlement` domain struct with the following fields: `ID` (int), `UserID` (int, FK users.id), `Amount` (int64, cents), `Type` (SettlementType: credit/debit), `AccountID` (int, FK accounts.id), `SourceTransactionID` (int, FK transactions.id), `ParentTransactionID` (int, FK transactions.id), `CreatedAt` (*time.Time), `UpdatedAt` (*time.Time). A dedicated `SettlementType` enum SHALL be declared with values `credit` and `debit`.

#### Scenario: Domain struct is created
- **WHEN** a settlement is instantiated in Go code
- **THEN** it contains all required fields with correct types

---

### Requirement: Settlement database table
The system SHALL create a `settlements` table via a Goose SQL migration with columns matching the domain struct. Both `source_transaction_id` and `parent_transaction_id` SHALL have `ON DELETE CASCADE ON UPDATE CASCADE` FK constraints referencing `transactions.id`. Indexes SHALL exist on `user_id`, `source_transaction_id`, and `parent_transaction_id`.

#### Scenario: Migration applies cleanly
- **WHEN** the migration is run against a fresh database
- **THEN** the `settlements` table exists with all columns, FK constraints, and indexes

#### Scenario: Cascade delete from source transaction
- **WHEN** the transaction referenced by `source_transaction_id` is hard-deleted
- **THEN** the linked settlement row is automatically deleted

#### Scenario: Cascade delete from parent transaction
- **WHEN** the transaction referenced by `parent_transaction_id` is hard-deleted
- **THEN** the linked settlement row is automatically deleted

---

### Requirement: Settlement GORM entity
The system SHALL provide a `entity.Settlement` GORM struct with `ToDomain()` and `SettlementFromDomain()` conversion methods. The entity SHALL set `created_at` and `updated_at` via `BeforeCreate`/`BeforeUpdate` hooks.

#### Scenario: Entity converts to domain
- **WHEN** `ToDomain()` is called on an entity.Settlement
- **THEN** all fields map correctly to a domain.Settlement

#### Scenario: Domain converts to entity
- **WHEN** `SettlementFromDomain()` is called with a domain.Settlement
- **THEN** all fields map correctly to an entity.Settlement

---

### Requirement: Settlement repository
The system SHALL provide a `SettlementRepository` interface and implementation with the following methods: `Search(ctx, SettlementFilter) ([]*domain.Settlement, error)`, `Create(ctx, *domain.Settlement) (*domain.Settlement, error)`, `Update(ctx, *domain.Settlement) error`, `Delete(ctx, ids []int) error`. The `SettlementFilter` SHALL support filtering by `IDs`, `UserIDs`, `AccountIDs`, `SourceTransactionIDs`, `ParentTransactionIDs`, `Limit`, and `Offset`.

#### Scenario: Create a settlement
- **WHEN** `Create` is called with a valid Settlement
- **THEN** a row is inserted and the returned struct has a non-zero ID

#### Scenario: Search by user
- **WHEN** `Search` is called with a filter containing a UserID
- **THEN** only settlements belonging to that user are returned

#### Scenario: Search by parent transaction
- **WHEN** `Search` is called with a ParentTransactionID filter
- **THEN** only settlements linked to that transaction are returned

#### Scenario: Update a settlement
- **WHEN** `Update` is called with a modified Settlement
- **THEN** the corresponding database row reflects the new values

#### Scenario: Delete settlements
- **WHEN** `Delete` is called with a list of IDs
- **THEN** those settlement rows are removed from the database

---

### Requirement: Settlement service
The system SHALL provide a `SettlementService` interface and implementation with the following methods: `Search(ctx, SettlementFilter) ([]*domain.Settlement, error)`, `SearchOne(ctx, SettlementFilter) (*domain.Settlement, error)`, `Create(ctx, *domain.Settlement) (*domain.Settlement, error)`, `Update(ctx, *domain.Settlement) error`, `Delete(ctx, ids []int) error`. `SearchOne` SHALL return an error if no result is found.

#### Scenario: SearchOne returns single result
- **WHEN** `SearchOne` is called and exactly one settlement matches the filter
- **THEN** that settlement is returned without error

#### Scenario: SearchOne returns error when not found
- **WHEN** `SearchOne` is called and no settlement matches
- **THEN** an error is returned

---

### Requirement: Settlement wired into application
The system SHALL register `SettlementRepository` in `repository.Repositories` and `SettlementService` in `service.Services`. Both SHALL be constructed and injected in `cmd/server/main.go`.

#### Scenario: Application starts with settlement wired
- **WHEN** the server starts
- **THEN** `Services.Settlement` and `Repositories.Settlement` are non-nil and ready for use
