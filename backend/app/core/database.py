from collections.abc import Generator
import ipaddress
import logging
import os
import socket
import threading
import time
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings
from app.models.base import Base

logger = logging.getLogger(__name__)

# Дольше, чем pool_recycle: переоткрытие соединения не должно снова
# зависеть от DNS, если Timeweb или резолвер контейнера на секунду
# ответили «имени нет».
_HOSTADDR_TTL_SECONDS = 600.0
_DNS_ATTEMPTS = 3
_DNS_RETRY_DELAY_SECONDS = 0.25


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
    # Только sslmode и таймаут. TCP keepalives в контейнере Timeweb дают
    # setsockopt-ошибку, процесс падает до healthcheck.
    args: dict[str, object] = {
        "sslmode": ssl_mode,
        "connect_timeout": settings.DB_CONNECT_TIMEOUT,
    }

    if ssl_mode in {"verify-full", "verify-ca"}:
        ssl_root_cert = os.environ.get("PGSSLROOTCERT", "/app/certs/root.crt")
        if Path(ssl_root_cert).is_file():
            args["sslrootcert"] = ssl_root_cert

    return args


class _HostAddressCache:
    def __init__(self, ttl_seconds: float) -> None:
        self.ttl_seconds = ttl_seconds
        self._lock = threading.Lock()
        self._entries: dict[str, tuple[str, float]] = {}

    def get_fresh(self, host: str) -> str | None:
        now = time.monotonic()
        with self._lock:
            entry = self._entries.get(host)
            if entry is None or now - entry[1] > self.ttl_seconds:
                return None
            return entry[0]

    def get_stale(self, host: str) -> str | None:
        with self._lock:
            entry = self._entries.get(host)
            return None if entry is None else entry[0]

    def store(self, host: str, ip: str) -> None:
        with self._lock:
            self._entries[host] = (ip, time.monotonic())


_postgres_hostaddr_cache = _HostAddressCache(_HOSTADDR_TTL_SECONDS)


def _is_ip_literal(host: str) -> bool:
    try:
        ipaddress.ip_address(host)
    except ValueError:
        return False
    return True


def _lookup_host(host: str) -> str:
    infos = socket.getaddrinfo(host, 5432, type=socket.SOCK_STREAM)
    for family, _socktype, _proto, _canon, sockaddr in infos:
        if family == socket.AF_INET:
            return str(sockaddr[0])
    if not infos:
        raise socket.gaierror(socket.EAI_NONAME, "Name or service not known")
    return str(infos[0][4][0])


def resolve_hostaddr(
    host: str,
    *,
    cache: _HostAddressCache | None = None,
    attempts: int = _DNS_ATTEMPTS,
) -> str | None:
    """Возвращает IP для libpq hostaddr.

    Свежий адрес берётся из кэша без DNS. Если резолвер снова ответил
    «Name or service not known», используется последний удачный IP.
    """
    resolved_cache = cache or _postgres_hostaddr_cache
    fresh = resolved_cache.get_fresh(host)
    if fresh:
        return fresh

    delay = _DNS_RETRY_DELAY_SECONDS
    last_error: socket.gaierror | None = None
    for attempt in range(attempts):
        try:
            ip = _lookup_host(host)
        except socket.gaierror as exc:
            last_error = exc
            if attempt + 1 < attempts:
                time.sleep(delay)
                delay *= 2
            continue
        resolved_cache.store(host, ip)
        return ip

    stale = resolved_cache.get_stale(host)
    if stale is not None:
        logger.warning(
            "DNS не резолвит %s (%s), подключаюсь к сохранённому адресу %s",
            host,
            last_error,
            stale,
        )
        return stale
    return None


def pin_resolved_hostaddr(dialect, conn_rec, cargs, cparams) -> None:
    """Подставляет hostaddr, чтобы psycopg2 не резолвил имя на каждом connect.

    host остаётся в параметрах: при verify-full сертификат сверяется с именем,
    а TCP идёт на IP. sslmode=require имя сертификата не проверяет.
    """
    host = cparams.get("host")
    if not isinstance(host, str) or not host or _is_ip_literal(host):
        return None
    ip = resolve_hostaddr(host)
    if ip:
        cparams["hostaddr"] = ip
    return None


database_url = sanitize_database_url(settings.DATABASE_URL)
connect_args = build_connect_args(settings.DATABASE_URL)

engine_kwargs: dict[str, object] = {
    "connect_args": connect_args,
    "pool_pre_ping": not database_url.startswith("sqlite"),
}
if database_url.startswith("postgresql"):
    # Один воркер держит пул тёплым. Раньше 2 воркера × (3 + 5) при одновременной
    # работе менеджеров открывали новые SSL-сессии, и Timeweb их отклонял.
    engine_kwargs.update(
        pool_size=settings.DB_POOL_SIZE,
        max_overflow=settings.DB_MAX_OVERFLOW,
        pool_recycle=settings.DB_POOL_RECYCLE,
        pool_timeout=settings.DB_POOL_TIMEOUT,
    )

engine = create_engine(database_url, **engine_kwargs)
if database_url.startswith("postgresql"):
    event.listens_for(engine, "do_connect")(pin_resolved_hostaddr)
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
