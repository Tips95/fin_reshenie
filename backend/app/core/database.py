from collections.abc import Generator
import os
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings
from app.models.base import Base


def _postgres_connect_args(database_url: str) -> dict[str, object]:
    if not database_url.startswith("postgresql"):
        return {}

    ssl_root_cert = os.environ.get("PGSSLROOTCERT", "/app/certs/root.crt")
    if Path(ssl_root_cert).is_file():
        return {
            "sslmode": "verify-full",
            "sslrootcert": ssl_root_cert,
        }

    if "sslmode=" in database_url:
        return {"sslmode": "require"}

    return {}


connect_args = (
    {"check_same_thread": False}
    if settings.DATABASE_URL.startswith("sqlite")
    else _postgres_connect_args(settings.DATABASE_URL)
)

engine = create_engine(
    settings.DATABASE_URL,
    pool_pre_ping=not settings.DATABASE_URL.startswith("sqlite"),
    connect_args=connect_args,
)
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
