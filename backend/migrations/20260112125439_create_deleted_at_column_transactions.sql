-- +goose Up
-- +goose StatementBegin
ALTER TABLE transactions ADD COLUMN deleted_at TIMESTAMP WITH TIME ZONE;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE transactions DROP COLUMN deleted_at;
-- +goose StatementEnd
