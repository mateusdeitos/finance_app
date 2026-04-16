-- +goose Up
-- Add date column with temporary default so existing rows get a value, then drop default.
ALTER TABLE charges ADD COLUMN date TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE charges ALTER COLUMN date DROP DEFAULT;

-- +goose Down
ALTER TABLE charges DROP COLUMN date;
