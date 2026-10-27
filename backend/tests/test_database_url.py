import socket
import time

from app.core.database import (
    _HostAddressCache,
    build_connect_args,
    pin_resolved_hostaddr,
    resolve_hostaddr,
    sanitize_database_url,
)


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


def test_postgres_connect_args_timeout_without_keepalives(monkeypatch):
    monkeypatch.setenv("DATABASE_SSL_MODE", "require")
    args = build_connect_args("postgresql://user:pass@host:5432/db")
    assert args["sslmode"] == "require"
    assert args["connect_timeout"] == 20
    assert "keepalives" not in args


def test_sqlite_connect_args_skip_postgres_timeouts():
    assert build_connect_args("sqlite:///./dev.db") == {"check_same_thread": False}


def _addrinfo(ip: str) -> list[tuple]:
    return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (ip, 5432))]


def test_resolve_retries_then_caches(monkeypatch):
    cache = _HostAddressCache(ttl_seconds=600)
    calls = {"n": 0}

    def flaky(host, port, *args, **kwargs):
        calls["n"] += 1
        if calls["n"] < 3:
            raise socket.gaierror(socket.EAI_NONAME, "Name or service not known")
        return _addrinfo("10.1.0.8")

    monkeypatch.setattr(socket, "getaddrinfo", flaky)
    monkeypatch.setattr(time, "sleep", lambda _delay: None)

    assert resolve_hostaddr("db.example", cache=cache, attempts=3) == "10.1.0.8"
    assert resolve_hostaddr("db.example", cache=cache, attempts=3) == "10.1.0.8"
    assert calls["n"] == 3


def test_resolve_falls_back_to_last_good_address(monkeypatch):
    cache = _HostAddressCache(ttl_seconds=10)
    now = {"t": 1_000.0}
    monkeypatch.setattr(time, "monotonic", lambda: now["t"])
    monkeypatch.setattr(time, "sleep", lambda _delay: None)
    monkeypatch.setattr(socket, "getaddrinfo", lambda *args, **kwargs: _addrinfo("10.2.0.4"))

    assert resolve_hostaddr("db.example", cache=cache, attempts=1) == "10.2.0.4"

    now["t"] = 1_020.0

    def broken(*args, **kwargs):
        raise socket.gaierror(socket.EAI_NONAME, "Name or service not known")

    monkeypatch.setattr(socket, "getaddrinfo", broken)
    assert resolve_hostaddr("db.example", cache=cache, attempts=2) == "10.2.0.4"


def test_pin_hostaddr_skips_ip_literal():
    cparams = {"host": "10.0.0.5", "sslmode": "require"}
    pin_resolved_hostaddr(None, None, [], cparams)
    assert "hostaddr" not in cparams


def test_pin_hostaddr_sets_resolved_ip(monkeypatch):
    monkeypatch.setattr(
        "app.core.database.resolve_hostaddr",
        lambda host, **kwargs: "10.8.0.3",
    )
    cparams = {"host": "ec20aee5d058cc100363b5a2.twc1.net"}
    pin_resolved_hostaddr(None, None, [], cparams)
    assert cparams["hostaddr"] == "10.8.0.3"
    assert cparams["host"] == "ec20aee5d058cc100363b5a2.twc1.net"
