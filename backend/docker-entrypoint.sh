#!/bin/sh
set -e

if [ -z "$DATABASE_URL" ]; then
  echo "ERROR: DATABASE_URL is not set. Add it in Timeweb App Platform environment variables."
  exit 1
fi

echo "DATABASE_URL is configured"
echo "Checking database connection..."
python - <<'PY'
from sqlalchemy import create_engine, text
from app.core.config import settings
from app.core.database import build_connect_args

engine = create_engine(
    settings.DATABASE_URL,
    connect_args=build_connect_args(settings.DATABASE_URL),
)
with engine.connect() as conn:
    conn.execute(text("SELECT 1"))
print("Database connection OK")
PY

echo "Running database migrations..."
alembic upgrade head

if [ "${RUN_SEED:-true}" = "true" ]; then
  echo "Running seed (idempotent)..."
  python -m app.services.seed || echo "WARN: seed failed, continuing startup"
fi

echo "Starting API server..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
