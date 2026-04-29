-- +goose Up
CREATE INDEX idx_categories_user_lower_name ON categories(user_id, (LOWER(name)));

-- +goose Down
DROP INDEX IF EXISTS idx_categories_user_lower_name;
