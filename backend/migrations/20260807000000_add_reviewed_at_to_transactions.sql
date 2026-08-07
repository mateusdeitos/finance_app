-- +goose Up
ALTER TABLE transactions ADD COLUMN reviewed_at TIMESTAMPTZ;
CREATE INDEX idx_transactions_reviewed_at ON transactions(reviewed_at);

-- +goose Down
DROP INDEX IF EXISTS idx_transactions_reviewed_at;
ALTER TABLE transactions DROP COLUMN IF EXISTS reviewed_at;
