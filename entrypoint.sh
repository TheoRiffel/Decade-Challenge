#!/bin/sh
set -e

echo "→ Running database migrations..."
node dist/db/migrate.js

echo "→ Running ingestion (idempotent)..."
node dist/ingestion/cli.js

echo "→ Starting API server..."
exec node dist/server.js
