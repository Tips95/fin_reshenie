import json

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
    )

    PROJECT_NAME: str = "Fin Reshenie"
    VERSION: str = "0.1.0"
    API_PREFIX: str = "/api"

    DATABASE_URL: str = "postgresql://postgres:postgres@localhost:5432/rassrochka"

    SECRET_KEY: str = "change-me-in-production"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    ALGORITHM: str = "HS256"

    CORS_ORIGINS: list[str] = ["http://localhost:3000", "http://localhost"]

    UPLOAD_DIR: str = "uploads"
    MAX_UPLOAD_SIZE_MB: int = 10

    # Обычно тарифы и статьи расходов досеиваются только тем компаниям, у
    # которых их нет: иначе правки компании откатывались бы при каждом деплое.
    # Флаг включает принудительное применение эталонной сетки ко всем.
    FORCE_ORGANIZATION_DEFAULTS_SYNC: bool = False

    # Один процесс uvicorn делит эти соединения между всеми менеджерами.
    # Запас сверху маленький: лишние SSL-подключения к Timeweb часто обрываются.
    DB_POOL_SIZE: int = 10
    DB_MAX_OVERFLOW: int = 2
    DB_POOL_TIMEOUT: int = 20
    DB_POOL_RECYCLE: int = 300
    DB_CONNECT_TIMEOUT: int = 10

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def parse_cors_origins(cls, value: object) -> list[str]:
        if isinstance(value, str):
            raw = value.strip()
            if raw.startswith("["):
                return json.loads(raw)
            return [raw]
        return value  # type: ignore[return-value]


settings = Settings()
