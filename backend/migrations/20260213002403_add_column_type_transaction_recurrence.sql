-- +goose Up
-- +goose StatementBegin
ALTER TABLE transaction_recurrences ADD COLUMN type recurrence_type NOT NULL DEFAULT 'daily';
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE transaction_recurrences DROP COLUMN type;
-- +goose StatementEnd
