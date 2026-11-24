import json

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


def _clean_env_str(value: object) -> object:
    """Убрать пробелы/кавычки; числа из панелей → строка (idInstance)."""
    if value is None:
        return value
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        # 720122811283 как число из YAML/панели
        return str(int(value)) if float(value).is_integer() else str(value)
    if isinstance(value, str):
        cleaned = value.strip().strip('"').strip("'").strip()
        return cleaned
    return value


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        # Timeweb/оболочки иногда отдают имена в другом регистре.
        case_sensitive=False,
        extra="ignore",
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

    # Приложение работает на одну юридическую компанию: новые компании
    # через сайт не регистрируются. Включать только для разворачивания новой.
    ALLOW_ORGANIZATION_SIGNUP: bool = False

    # Один процесс uvicorn делит эти соединения между всеми менеджерами.
    # Запас сверху маленький: лишние SSL-подключения к Timeweb часто обрываются.
    DB_POOL_SIZE: int = 10
    DB_MAX_OVERFLOW: int = 2
    DB_POOL_TIMEOUT: int = 20
    DB_POOL_RECYCLE: int = 300
    DB_CONNECT_TIMEOUT: int = 20

    # Green API (WhatsApp). Пустые значения — превью работает, отправка недоступна.
    GREEN_API_URL: str = ""
    GREEN_API_ID_INSTANCE: str = ""
    GREEN_API_TOKEN_INSTANCE: str = ""
    GREEN_API_SEND_DELAY_SECONDS: float = 0.7

    @field_validator(
        "GREEN_API_URL",
        "GREEN_API_ID_INSTANCE",
        "GREEN_API_TOKEN_INSTANCE",
        mode="before",
    )
    @classmethod
    def clean_green_api_strings(cls, value: object) -> object:
        return _clean_env_str(value)

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
