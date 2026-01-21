-- +goose Up
-- +goose StatementBegin
CREATE TYPE operation_type AS ENUM ('credit', 'debit');
ALTER TABLE transactions ADD COLUMN operation_type operation_type NOT NULL DEFAULT 'debit';
ALTER TABLE transactions DROP COLUMN destination_account_id;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE transactions DROP COLUMN operation_type;
DROP TYPE operation_type;
ALTER TABLE transactions ADD COLUMN destination_account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL;
-- +goose StatementEnd
