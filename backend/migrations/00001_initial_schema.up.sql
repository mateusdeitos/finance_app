-- +goose Up
-- +goose StatementBegin

-- Create enums
CREATE TYPE provider_type AS ENUM ('google', 'microsoft');
CREATE TYPE recurrence_type AS ENUM ('daily', 'weekly', 'monthly', 'yearly');
CREATE TYPE transaction_type AS ENUM ('expense', 'income', 'transfer');

-- Create users table
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_name ON users(name);
CREATE INDEX idx_users_email ON users(email);

-- Create users_social table
CREATE TABLE users_social (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider provider_type NOT NULL,
    provider_id VARCHAR(255) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, provider)
);

CREATE INDEX idx_users_social_provider_id ON users_social(provider_id);

-- Create accounts table
CREATE TABLE accounts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_accounts_user_id ON accounts(user_id);

-- Create user_connections table
CREATE TYPE connection_status AS ENUM ('pending', 'accepted', 'rejected');
CREATE TABLE user_connections (
    id SERIAL PRIMARY KEY,
	from_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    from_account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
	from_default_split_percentage SMALLINT CHECK (from_default_split_percentage >= 0 AND from_default_split_percentage <= 100),
	to_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    to_account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    to_default_split_percentage SMALLINT CHECK (to_default_split_percentage >= 0 AND to_default_split_percentage <= 100),
    connection_status connection_status NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_user_connections_from_account_id ON user_connections(from_account_id);
CREATE INDEX idx_user_connections_to_account_id ON user_connections(to_account_id);
CREATE INDEX idx_user_connections_from_user_id ON user_connections(from_user_id);
CREATE INDEX idx_user_connections_to_user_id ON user_connections(to_user_id);
CREATE INDEX idx_user_connections_connection_status ON user_connections(connection_status);

-- Create categories table
CREATE TABLE categories (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    parent_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_categories_user_id ON categories(user_id);
CREATE INDEX idx_categories_parent_id ON categories(parent_id);

-- Create tags table
CREATE TABLE tags (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, name)
);

CREATE INDEX idx_tags_user_id ON tags(user_id);

-- Create transactions table
CREATE TABLE transactions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type transaction_type NOT NULL,
    account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    amount BIGINT NOT NULL CHECK (amount > 0),
    date DATE NOT NULL,
    description VARCHAR(255) NOT NULL,
    destination_account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
    split_percentage SMALLINT CHECK (split_percentage >= 0 AND split_percentage <= 100),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_transactions_user_account ON transactions(user_id, account_id);
CREATE INDEX idx_transactions_description ON transactions(description);
CREATE INDEX idx_transactions_date ON transactions(date);
CREATE INDEX idx_transactions_category_id ON transactions(category_id);
CREATE INDEX idx_transactions_destination_account_id ON transactions(destination_account_id);

-- Create transaction_recurrences table
CREATE TABLE transaction_recurrences (
    id SERIAL PRIMARY KEY,
    transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    index SMALLINT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(transaction_id, index)
);

CREATE INDEX idx_transaction_recurrences_transaction_id ON transaction_recurrences(transaction_id);

-- Create transaction_tags table (many-to-many)
CREATE TABLE transaction_tags (
    transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (transaction_id, tag_id)
);

-- Create user_settings table
CREATE TABLE user_settings (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    settings JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

DROP TABLE IF EXISTS user_settings;
DROP TABLE IF EXISTS transaction_tags;
DROP TABLE IF EXISTS transaction_recurrences;
DROP TABLE IF EXISTS transactions;
DROP TABLE IF EXISTS tags;
DROP TABLE IF EXISTS categories;
DROP TABLE IF EXISTS user_connections;
DROP TABLE IF EXISTS accounts;
DROP TABLE IF EXISTS users_social;
DROP TABLE IF EXISTS users;

DROP TYPE IF EXISTS transaction_type;
DROP TYPE IF EXISTS recurrence_type;
DROP TYPE IF EXISTS provider_type;
DROP TYPE IF EXISTS connection_status;

-- +goose StatementEnd

