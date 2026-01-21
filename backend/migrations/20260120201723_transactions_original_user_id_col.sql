-- +goose Up
-- +goose StatementBegin
ALTER TABLE transactions ADD COLUMN original_user_id INT REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX idx_transactions_original_user_id ON transactions(original_user_id);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE transactions DROP COLUMN original_user_id;
DROP INDEX IF EXISTS idx_transactions_original_user_id;
-- +goose StatementEnd
