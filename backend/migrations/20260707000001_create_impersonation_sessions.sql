-- +goose Up
-- Durable audit trail for admin impersonation. One row per "start impersonation"
-- action; the row's id doubles as the JWT `jti`, so a session can be revoked
-- server-side (revoked_at) and every impersonation token is individually
-- traceable and killable. Never deleted on stop — only marked revoked.
CREATE TABLE impersonation_sessions (
    id             UUID PRIMARY KEY,
    admin_user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    target_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reason         TEXT NOT NULL,
    ip_address     TEXT,
    user_agent     TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at     TIMESTAMPTZ NOT NULL,
    revoked_at     TIMESTAMPTZ
);

CREATE INDEX idx_impersonation_sessions_admin_user_id ON impersonation_sessions (admin_user_id);
CREATE INDEX idx_impersonation_sessions_target_user_id ON impersonation_sessions (target_user_id);

-- +goose Down
DROP INDEX idx_impersonation_sessions_target_user_id;
DROP INDEX idx_impersonation_sessions_admin_user_id;
DROP TABLE impersonation_sessions;
