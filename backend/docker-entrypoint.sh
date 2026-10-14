#!/bin/sh
set -e

if [ -z "$DATABASE_URL" ]; then
  echo "ERROR: DATABASE_URL is not set. Add it in Timeweb App Platform environment variables."
  exit 1
fi

echo "DATABASE_URL is configured"
echo "DATABASE_SSL_MODE=${DATABASE_SSL_MODE:-require}"
unset PGSSLROOTCERT
echo "Checking database connection..."
db_ok=0
db_attempt=1
while [ "$db_attempt" -le 5 ]; do
  if python - <<'PY'
from sqlalchemy import create_engine, text
from app.core.config import settings
from app.core.database import build_connect_args, sanitize_database_url

database_url = sanitize_database_url(settings.DATABASE_URL)
connect_args = build_connect_args(settings.DATABASE_URL)
print(f"Using sslmode={connect_args.get('sslmode', 'default')}")

engine = create_engine(
    database_url,
    connect_args=connect_args,
)
with engine.connect() as conn:
    conn.execute(text("SELECT 1"))
print("Database connection OK")
PY
  then
    db_ok=1
    break
  fi
  echo "Database is not ready (attempt ${db_attempt}/5), retrying in 5s..."
  db_attempt=$((db_attempt + 1))
  sleep 5
done
if [ "$db_ok" -ne 1 ]; then
  echo "ERROR: database connection failed"
  exit 1
fi

echo "Running database migrations..."
alembic upgrade head

# Idempotent seed. Set RUN_SEED=false to skip on redeploy (data already present).
if [ "${RUN_SEED:-true}" = "true" ]; then
  echo "Running seed (idempotent)..."
  if ! python -m app.services.seed; then
    echo "ERROR: seed failed — pricing tiers may be missing. Check logs above."
  fi
fi

echo "Starting API server..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 1
