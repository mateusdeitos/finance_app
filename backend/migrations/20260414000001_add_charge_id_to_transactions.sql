-- +goose Up
-- +goose StatementBegin
ALTER TABLE transactions ADD COLUMN charge_id INT REFERENCES charges(id) ON DELETE SET NULL;
CREATE INDEX idx_transactions_charge_id ON transactions(charge_id) WHERE charge_id IS NOT NULL;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP INDEX IF EXISTS idx_transactions_charge_id;
ALTER TABLE transactions DROP COLUMN charge_id;
-- +goose StatementEnd
