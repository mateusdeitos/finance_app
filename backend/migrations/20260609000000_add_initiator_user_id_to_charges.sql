-- +goose Up
ALTER TABLE charges ADD COLUMN initiator_user_id INT REFERENCES users(id);

-- Backfill: the initiator is whoever set their own account at creation time.
-- A payer-initiated charge has only payer_account_id set; every other shape
-- (charger-initiated pending, accepted, cancelled, rejected) is attributed to
-- the charger, matching the historical "charger always initiates" assumption.
UPDATE charges SET initiator_user_id = CASE
    WHEN payer_account_id IS NOT NULL AND charger_account_id IS NULL THEN payer_user_id
    ELSE charger_user_id
END;

ALTER TABLE charges ALTER COLUMN initiator_user_id SET NOT NULL;

CREATE INDEX idx_charges_initiator_user_id ON charges(initiator_user_id);

-- +goose Down
DROP INDEX IF EXISTS idx_charges_initiator_user_id;
ALTER TABLE charges DROP COLUMN initiator_user_id;
