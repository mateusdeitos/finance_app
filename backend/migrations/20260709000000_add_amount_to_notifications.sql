-- +goose Up
ALTER TABLE notifications ADD COLUMN amount BIGINT;

-- +goose Down
ALTER TABLE notifications DROP COLUMN amount;
