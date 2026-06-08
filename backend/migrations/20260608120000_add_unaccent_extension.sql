-- +goose Up
CREATE EXTENSION IF NOT EXISTS unaccent;

-- +goose Down
DROP EXTENSION IF EXISTS unaccent;
