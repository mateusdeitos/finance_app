-- +goose Up
ALTER TABLE users ADD COLUMN external_id UUID NOT NULL DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX idx_users_external_id ON users(external_id);

-- +goose Down
DROP INDEX IF EXISTS idx_users_external_id;
ALTER TABLE users DROP COLUMN IF EXISTS external_id;
