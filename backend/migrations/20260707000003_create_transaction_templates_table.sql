-- +goose Up
CREATE TABLE transaction_templates (
    id         SERIAL PRIMARY KEY,
    user_id    INT          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name       VARCHAR(255) NOT NULL,
    payload    JSONB        NOT NULL,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, name)
);
CREATE INDEX idx_transaction_templates_user_id ON transaction_templates(user_id);

-- +goose Down
DROP TABLE IF EXISTS transaction_templates;
