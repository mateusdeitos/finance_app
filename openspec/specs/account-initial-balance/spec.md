## ADDED Requirements

### Requirement: Account stores initial balance
Manually created accounts SHALL have an `initial_balance` field (int64, stored in cents). The default value SHALL be 0. Connection-linked accounts (accounts referenced by `user_connections.from_account_id` or `to_account_id`) SHALL NOT accept a non-zero `initial_balance`.

#### Scenario: Create account with initial balance
- **WHEN** a user creates an account with `initial_balance = 50000` (500.00 in currency)
- **THEN** the account is persisted with `initial_balance = 50000`

#### Scenario: Create account without initial balance defaults to zero
- **WHEN** a user creates an account without providing `initial_balance`
- **THEN** the account is persisted with `initial_balance = 0`

#### Scenario: Update account initial balance
- **WHEN** a user updates an existing manually created account setting `initial_balance = 10000`
- **THEN** the account reflects the new `initial_balance = 10000`

#### Scenario: Connection account rejects non-zero initial balance on create
- **WHEN** a user attempts to create an account that is already referenced as a connection account with `initial_balance != 0`
- **THEN** the system returns a validation error

#### Scenario: Connection account rejects non-zero initial balance on update
- **WHEN** a user attempts to update a connection account to set `initial_balance != 0`
- **THEN** the system returns a validation error

#### Scenario: Connection account accepts zero initial balance
- **WHEN** a user updates a connection account with `initial_balance = 0`
- **THEN** the update succeeds (no-op)
