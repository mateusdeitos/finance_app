-- +goose Up
CREATE TABLE budget_alert_thresholds (
    id                SERIAL PRIMARY KEY,
    budget_id         INT     NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
    threshold_pct     INT     NOT NULL CHECK (threshold_pct BETWEEN 1 AND 200),
    enabled           BOOLEAN NOT NULL DEFAULT TRUE,
    last_fired_period TEXT,
    CONSTRAINT uq_budget_alert_thresholds_budget_pct UNIQUE (budget_id, threshold_pct)
);
CREATE INDEX idx_budget_alert_thresholds_budget_id ON budget_alert_thresholds(budget_id);

-- +goose Down
DROP TABLE IF EXISTS budget_alert_thresholds;
