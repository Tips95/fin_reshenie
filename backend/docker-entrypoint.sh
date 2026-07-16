#!/bin/sh
set -e

if [ -z "$DATABASE_URL" ]; then
  echo "ERROR: DATABASE_URL is not set. Add it in Timeweb App Platform environment variables."
  exit 1
fi

echo "DATABASE_URL is configured"
echo "Running database migrations..."
alembic upgrade head

if [ "${RUN_SEED:-true}" = "true" ]; then
  echo "Running seed (idempotent)..."
  python -m app.services.seed || echo "WARN: seed failed, continuing startup"
fi

echo "Starting API server..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
