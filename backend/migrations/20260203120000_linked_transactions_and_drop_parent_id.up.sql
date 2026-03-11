-- +goose Up
-- +goose StatementBegin

CREATE TABLE linked_transactions (
    transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    linked_transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    PRIMARY KEY (transaction_id, linked_transaction_id),
    CHECK (transaction_id != linked_transaction_id)
);

-- PK (transaction_id, linked_transaction_id) já cobre buscas por transaction_id.
-- Índice em linked_transaction_id para GetSourceTransactionIDs (busca reversa).
CREATE INDEX idx_linked_transactions_linked_transaction_id ON linked_transactions(linked_transaction_id);

ALTER TABLE transactions DROP COLUMN IF EXISTS parent_id;

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

ALTER TABLE transactions ADD COLUMN parent_id INTEGER REFERENCES transactions(id) ON DELETE SET NULL;
CREATE INDEX idx_transactions_parent_id ON transactions(parent_id);

DROP TABLE IF EXISTS linked_transactions;

-- +goose StatementEnd
