## ADDED Requirements

### Requirement: GetBalance supports accumulated mode
The `GET /api/transactions/balance` endpoint SHALL accept an `accumulated` boolean query parameter. When `accumulated=false` (default), the existing single-period behaviour is preserved. When `accumulated=true`, the system SHALL return the sum of:
1. The `initial_balance` of all accounts contributing to the query (filtered by `account_id[]` if provided, otherwise all user accounts).
2. The net balance of all transactions and settlements for the user from the beginning of recorded history up to and including the last moment of the requested period (no lower date bound applied).

#### Scenario: accumulated=false returns single period balance (default behaviour)
- **WHEN** a GET request is made to `/api/transactions/balance?month=3&year=2026` without `accumulated`
- **THEN** the response contains only the net balance for March 2026

#### Scenario: accumulated=true with zero initial balance returns sum of all periods
- **WHEN** all user accounts have `initial_balance = 0` and a GET request is made with `accumulated=true&month=3&year=2026`
- **THEN** the response contains the net balance of all transactions from the beginning of history through the end of March 2026

#### Scenario: accumulated=true adds initial balance to transaction sum
- **WHEN** the user has one account with `initial_balance = 10000` and a GET request is made with `accumulated=true&month=3&year=2026`
- **THEN** the response balance equals 10000 plus the net of all transactions through the end of March 2026

#### Scenario: accumulated=true with account filter uses only those accounts' initial balances
- **WHEN** a GET request is made with `accumulated=true&account_id[]=5` and account 5 has `initial_balance = 2000`
- **THEN** only account 5's `initial_balance` (2000) contributes to the initial balance portion

#### Scenario: accumulated=true with no transactions returns initial balance only
- **WHEN** a user has an account with `initial_balance = 5000` and no transactions, and requests `accumulated=true`
- **THEN** the response balance equals 5000

#### Scenario: accumulated=false ignores initial balance
- **WHEN** a user has an account with `initial_balance = 99999` and requests `accumulated=false`
- **THEN** the initial balance does NOT contribute to the result
