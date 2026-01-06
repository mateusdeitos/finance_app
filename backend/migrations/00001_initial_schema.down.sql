-- +goose Down
-- +goose StatementBegin

DROP TABLE IF EXISTS user_settings;
DROP TABLE IF EXISTS transaction_tags;
DROP TABLE IF EXISTS transaction_recurrences;
DROP TABLE IF EXISTS transactions;
DROP TABLE IF EXISTS tags;
DROP TABLE IF EXISTS categories;
DROP TABLE IF EXISTS accounts;
DROP TABLE IF EXISTS users_social;
DROP TABLE IF EXISTS users;

DROP TYPE IF EXISTS transaction_type;
DROP TYPE IF EXISTS recurrence_type;
DROP TYPE IF EXISTS provider_type;

-- +goose StatementEnd

