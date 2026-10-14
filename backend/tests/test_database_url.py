from app.core.database import build_connect_args, sanitize_database_url


def test_forces_psycopg2_dialect():
    assert sanitize_database_url(
        "postgresql://user:pass@host:5432/db"
    ).startswith("postgresql+psycopg2://")


def test_rewrites_psycopg3_dialect():
    url = sanitize_database_url("postgresql+psycopg://user:pass@host:5432/db?sslmode=require")
    assert url.startswith("postgresql+psycopg2://")
    assert "sslmode" not in url


def test_leaves_sqlite_alone():
    assert sanitize_database_url("sqlite:///./dev.db") == "sqlite:///./dev.db"


def test_postgres_connect_args_timeout_and_keepalives(monkeypatch):
    monkeypatch.setenv("DATABASE_SSL_MODE", "require")
    args = build_connect_args("postgresql://user:pass@host:5432/db")
    assert args["sslmode"] == "require"
    assert args["connect_timeout"] == 10
    assert args["keepalives"] == 1
    assert args["keepalives_idle"] == 30


def test_sqlite_connect_args_skip_postgres_timeouts():
    assert build_connect_args("sqlite:///./dev.db") == {"check_same_thread": False}
