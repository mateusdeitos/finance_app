-- +goose Up
-- Marks a user as an operator allowed to impersonate other users for support
-- troubleshooting. Defaults to false; admins are seeded at startup from the
-- ADMIN_EMAILS env (see cmd/server/main.go) and can be managed directly in DB.
ALTER TABLE users ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT false;

-- +goose Down
ALTER TABLE users DROP COLUMN is_admin;
