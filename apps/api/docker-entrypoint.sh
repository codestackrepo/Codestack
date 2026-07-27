#!/bin/sh
# API service entrypoint: run pending DB migrations, then start the HTTP server.
#
# Migrations run here (not in the worker) so exactly ONE process applies them on
# deploy. The worker service overrides this image's CMD to `node dist/worker.js`
# and so never reaches this script — avoiding two processes racing to migrate.
#
# `typeorm migration:run` is idempotent: already-applied migrations (tracked in
# typeorm_migrations) are skipped, so re-running on every deploy is safe.
set -e

echo "[entrypoint] Running database migrations..."
pnpm run migration:run:prod
echo "[entrypoint] Migrations complete. Starting API..."

exec node dist/main.js
