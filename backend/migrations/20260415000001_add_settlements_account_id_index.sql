-- +goose Up
-- +goose StatementBegin
CREATE INDEX idx_settlements_account_id ON settlements(account_id);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP INDEX IF EXISTS idx_settlements_account_id;
-- +goose StatementEnd
