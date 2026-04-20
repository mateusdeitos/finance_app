-- +goose Up
ALTER TABLE charges ADD COLUMN amount BIGINT;

-- +goose Down
ALTER TABLE charges DROP COLUMN amount;
