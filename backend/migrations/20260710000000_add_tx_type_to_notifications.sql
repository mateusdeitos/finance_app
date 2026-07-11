-- +goose Up
ALTER TABLE notifications ADD COLUMN tx_type TEXT;

-- +goose Down
ALTER TABLE notifications DROP COLUMN tx_type;
