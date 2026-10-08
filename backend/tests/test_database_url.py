from app.core.database import sanitize_database_url


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
