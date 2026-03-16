-- +goose Up
-- +goose StatementBegin
CREATE INDEX idx_transactions_balance ON transactions(user_id, date) INCLUDE (operation_type, amount) WHERE deleted_at IS NULL;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP INDEX IF EXISTS idx_transactions_balance;
-- +goose StatementEnd
