from collections.abc import Generator
import os
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings
from app.models.base import Base


def build_connect_args(database_url: str) -> dict[str, object]:
    if database_url.startswith("sqlite"):
        return {"check_same_thread": False}

    if not database_url.startswith("postgresql"):
        return {}

    # Timeweb Managed PostgreSQL: verify-full часто падает из-за hostname в сертификате.
    # require шифрует соединение и стабильно работает в Docker.
    ssl_mode = os.environ.get("DATABASE_SSL_MODE", "require").strip() or "require"
    ssl_root_cert = os.environ.get("PGSSLROOTCERT", "/app/certs/root.crt")

    args: dict[str, object] = {"sslmode": ssl_mode}
    if ssl_mode in {"verify-full", "verify-ca"} and Path(ssl_root_cert).is_file():
        args["sslrootcert"] = ssl_root_cert
    return args


connect_args = build_connect_args(settings.DATABASE_URL)

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
