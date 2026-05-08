-- +goose Up
ALTER TABLE settlements ADD COLUMN date DATE;

UPDATE settlements s
SET date = t.date
FROM transactions t
WHERE t.id = s.source_transaction_id;

ALTER TABLE settlements ALTER COLUMN date SET NOT NULL;

CREATE INDEX idx_settlements_date ON settlements(date);

-- +goose Down
DROP INDEX IF EXISTS idx_settlements_date;
ALTER TABLE settlements DROP COLUMN date;
