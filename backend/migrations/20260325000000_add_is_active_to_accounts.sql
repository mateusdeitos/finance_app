-- +goose Up
ALTER TABLE accounts ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT true;

-- +goose Down
ALTER TABLE accounts DROP COLUMN is_active;
