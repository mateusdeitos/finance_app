-- +goose Up
-- +goose StatementBegin
ALTER TABLE categories ADD COLUMN emoji VARCHAR(10);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE categories DROP COLUMN emoji;
-- +goose StatementEnd
