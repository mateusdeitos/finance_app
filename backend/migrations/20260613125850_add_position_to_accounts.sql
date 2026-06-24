-- +goose Up
ALTER TABLE accounts ADD COLUMN position INT NOT NULL DEFAULT 0;
-- Seed existing rows so each user's accounts keep a stable, deterministic order
-- (current id order) until the user reorders them.
UPDATE accounts SET position = id;

-- +goose Down
ALTER TABLE accounts DROP COLUMN position;
