-- +goose Up
CREATE TYPE settlement_type AS ENUM ('credit', 'debit');

CREATE TABLE settlements (
    id                     SERIAL PRIMARY KEY,
    user_id                INT NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    amount                 BIGINT NOT NULL,
    type                   settlement_type NOT NULL,
    account_id             INT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE ON UPDATE CASCADE,
    source_transaction_id  INT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE ON UPDATE CASCADE,
    parent_transaction_id  INT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE ON UPDATE CASCADE,
    created_at             TIMESTAMP,
    updated_at             TIMESTAMP
);

CREATE INDEX idx_settlements_user_id ON settlements(user_id);
CREATE INDEX idx_settlements_source_transaction_id ON settlements(source_transaction_id);
CREATE INDEX idx_settlements_parent_transaction_id ON settlements(parent_transaction_id);

-- +goose Down
DROP TABLE IF EXISTS settlements;
DROP TYPE IF EXISTS settlement_type;
