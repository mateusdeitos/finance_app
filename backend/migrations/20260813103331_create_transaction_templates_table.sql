-- +goose Up
CREATE TABLE transaction_templates (
    id         SERIAL PRIMARY KEY,
    user_id    INT          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name       VARCHAR(100) NOT NULL,
    payload    JSONB        NOT NULL,
    last_used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_transaction_templates_user_id ON transaction_templates(user_id);
CREATE INDEX idx_transaction_templates_recent
    ON transaction_templates (user_id, last_used_at DESC NULLS LAST, created_at DESC, id DESC);
CREATE UNIQUE INDEX idx_transaction_templates_user_name_ci
    ON transaction_templates (user_id, LOWER(name));

-- +goose Down
DROP TABLE IF EXISTS transaction_templates;
