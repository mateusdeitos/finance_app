-- +goose Up
CREATE INDEX idx_notifications_cursor ON notifications(user_id, created_at DESC, id DESC);

-- +goose Down
DROP INDEX IF EXISTS idx_notifications_cursor;
