-- +goose Up
ALTER TABLE accounts ADD COLUMN initial_balance bigint NOT NULL DEFAULT 0;

-- +goose Down
ALTER TABLE accounts DROP COLUMN initial_balance;
