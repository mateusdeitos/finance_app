-- +goose Up
-- Allow hard-deleting a private account that a charge references: the charge
-- keeps its status/amount/history, only the account reference is cleared.
-- (Postgres default FK names: <table>_<column>_fkey.)
ALTER TABLE charges DROP CONSTRAINT charges_charger_account_id_fkey;
ALTER TABLE charges DROP CONSTRAINT charges_payer_account_id_fkey;
ALTER TABLE charges ADD CONSTRAINT charges_charger_account_id_fkey
    FOREIGN KEY (charger_account_id) REFERENCES accounts(id) ON DELETE SET NULL;
ALTER TABLE charges ADD CONSTRAINT charges_payer_account_id_fkey
    FOREIGN KEY (payer_account_id) REFERENCES accounts(id) ON DELETE SET NULL;

-- +goose Down
ALTER TABLE charges DROP CONSTRAINT charges_charger_account_id_fkey;
ALTER TABLE charges DROP CONSTRAINT charges_payer_account_id_fkey;
ALTER TABLE charges ADD CONSTRAINT charges_charger_account_id_fkey
    FOREIGN KEY (charger_account_id) REFERENCES accounts(id);
ALTER TABLE charges ADD CONSTRAINT charges_payer_account_id_fkey
    FOREIGN KEY (payer_account_id) REFERENCES accounts(id);
