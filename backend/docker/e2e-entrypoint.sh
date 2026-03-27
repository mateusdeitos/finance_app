#!/bin/sh
set -e

DSN="host=${DB_HOST} port=${DB_PORT} user=${DB_USER} password=${DB_PASSWORD} dbname=${DB_NAME} sslmode=${DB_SSLMODE:-disable}"

echo "Running migrations..."
goose -dir /app/migrations postgres "$DSN" up

echo "Starting server..."
exec ./server
