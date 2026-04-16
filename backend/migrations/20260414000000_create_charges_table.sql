-- +goose Up
CREATE TABLE charges (
    id                  SERIAL PRIMARY KEY,
    charger_user_id     INT NOT NULL REFERENCES users(id),
    payer_user_id       INT NOT NULL REFERENCES users(id),
    charger_account_id  INT REFERENCES accounts(id),
    payer_account_id    INT REFERENCES accounts(id),
    connection_id       INT NOT NULL REFERENCES user_connections(id) ON DELETE RESTRICT,
    period_month        INT NOT NULL CHECK (period_month BETWEEN 1 AND 12),
    period_year         INT NOT NULL,
    description         TEXT,
    status              VARCHAR(20) NOT NULL DEFAULT 'pending',
    created_at          TIMESTAMPTZ,
    updated_at          TIMESTAMPTZ
);

CREATE INDEX idx_charges_charger_user_id ON charges(charger_user_id);
CREATE INDEX idx_charges_payer_user_id ON charges(payer_user_id);
CREATE INDEX idx_charges_connection_id ON charges(connection_id);
CREATE INDEX idx_charges_status ON charges(status);

-- +goose Down
DROP TABLE IF EXISTS charges;
