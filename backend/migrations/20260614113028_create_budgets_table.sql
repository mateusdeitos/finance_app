-- +goose Up
CREATE TABLE budgets (
    id            SERIAL PRIMARY KEY,
    owner_user_id INT         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category_id   INT         NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    amount_cents  BIGINT      NOT NULL,
    active        BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ,
    updated_at    TIMESTAMPTZ,
    CONSTRAINT uq_budgets_owner_category UNIQUE (owner_user_id, category_id)
);
CREATE INDEX idx_budgets_owner_user_id ON budgets(owner_user_id);
CREATE INDEX idx_budgets_category_id ON budgets(category_id);

-- +goose Down
DROP TABLE IF EXISTS budgets;
