-- +goose Up
-- Grant admin (impersonation) rights to the app operator. Runtime authorization
-- always reads users.is_admin; this seeds it. No-op if the user does not exist
-- yet (they can be promoted directly in the DB once created).
UPDATE users SET is_admin = true WHERE email = 'matdeitos@gmail.com';

-- +goose Down
UPDATE users SET is_admin = false WHERE email = 'matdeitos@gmail.com';
