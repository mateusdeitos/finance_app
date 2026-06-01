-- +goose Up
ALTER TABLE notifications ADD COLUMN description TEXT;

-- +goose Down
ALTER TABLE notifications DROP COLUMN description;
