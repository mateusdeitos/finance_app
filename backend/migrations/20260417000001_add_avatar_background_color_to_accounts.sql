-- +goose Up
ALTER TABLE accounts ADD COLUMN avatar_background_color VARCHAR(7) NOT NULL DEFAULT '#457b9d';

-- +goose Down
ALTER TABLE accounts DROP COLUMN IF EXISTS avatar_background_color;
