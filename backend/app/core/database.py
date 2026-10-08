from collections.abc import Generator
import os
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings
from app.models.base import Base


def sanitize_database_url(database_url: str) -> str:
    """Нормализует URL Postgres под установленный драйвер psycopg2.

    Убирает SSL-параметры из query — ими управляем только через connect_args.
    Форсирует dialect ``postgresql+psycopg2``, чтобы SQLAlchemy не пытался
    импортировать ``psycopg`` (v3), которого нет в образе.
    """
    if not database_url.startswith("postgresql"):
        return database_url

    parsed = urlparse(database_url)
    # postgresql:// и postgresql+psycopg:// → postgresql+psycopg2://
    scheme = "postgresql+psycopg2"
    query = [
        (key, value)
        for key, value in parse_qsl(parsed.query, keep_blank_values=True)
        if key.lower() not in {"sslmode", "sslrootcert"}
    ]
    return urlunparse(parsed._replace(scheme=scheme, query=urlencode(query)))


def build_connect_args(database_url: str) -> dict[str, object]:
    if database_url.startswith("sqlite"):
        return {"check_same_thread": False}

    if not database_url.startswith("postgresql"):
        return {}

    # Timeweb Managed PostgreSQL: verify-full падает в Docker из-за hostname в сертификате.
    ssl_mode = os.environ.get("DATABASE_SSL_MODE", "require").strip() or "require"
    args: dict[str, object] = {"sslmode": ssl_mode}

    if ssl_mode in {"verify-full", "verify-ca"}:
        ssl_root_cert = os.environ.get("PGSSLROOTCERT", "/app/certs/root.crt")
        if Path(ssl_root_cert).is_file():
            args["sslrootcert"] = ssl_root_cert

    return args


database_url = sanitize_database_url(settings.DATABASE_URL)
connect_args = build_connect_args(settings.DATABASE_URL)

engine_kwargs: dict[str, object] = {
    "connect_args": connect_args,
    "pool_pre_ping": not database_url.startswith("sqlite"),
}
if database_url.startswith("postgresql"):
    # 2 uvicorn workers × (3 + 5) = max 16 connections — safer for managed Postgres
    engine_kwargs.update(
        pool_size=3,
        max_overflow=5,
        pool_recycle=300,
        pool_timeout=30,
    )

engine = create_engine(database_url, **engine_kwargs)
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
