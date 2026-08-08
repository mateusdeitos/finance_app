-- +goose Up
ALTER TABLE settlements ADD COLUMN reviewed_at TIMESTAMPTZ;
CREATE INDEX idx_settlements_reviewed_at ON settlements(reviewed_at);

-- +goose Down
DROP INDEX IF EXISTS idx_settlements_reviewed_at;
ALTER TABLE settlements DROP COLUMN IF EXISTS reviewed_at;
