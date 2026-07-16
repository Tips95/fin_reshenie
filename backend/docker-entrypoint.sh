#!/bin/sh
set -e

echo "Running database migrations..."
alembic upgrade head

if [ "${RUN_SEED:-true}" = "true" ]; then
  echo "Running seed (idempotent)..."
  python -m app.services.seed
fi

echo "Starting API server..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
