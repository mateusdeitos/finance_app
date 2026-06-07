-- +goose Up
ALTER TABLE user_connections
    ADD COLUMN from_linked_transaction_day_of_month SMALLINT
        CHECK (from_linked_transaction_day_of_month BETWEEN 1 AND 31),
    ADD COLUMN to_linked_transaction_day_of_month SMALLINT
        CHECK (to_linked_transaction_day_of_month BETWEEN 1 AND 31);

-- +goose Down
ALTER TABLE user_connections
    DROP COLUMN from_linked_transaction_day_of_month,
    DROP COLUMN to_linked_transaction_day_of_month;
