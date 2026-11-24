"""Клиент Green API: отправка текстовых WhatsApp-сообщений."""

from __future__ import annotations

from dataclasses import dataclass

import httpx

from app.core.config import settings
from app.services.phone import normalize_phone


class GreenApiNotConfiguredError(RuntimeError):
    """Нет ключей Green API в организации и в env."""


class GreenApiError(RuntimeError):
    """Ошибка ответа или сети Green API."""


@dataclass(frozen=True, slots=True)
class GreenApiCredentials:
    api_url: str
    id_instance: str
    api_token: str


@dataclass(frozen=True, slots=True)
class GreenApiSendResult:
    id_message: str | None


def _clean(value: str | None) -> str:
    if not value:
        return ""
    return value.strip().strip('"').strip("'").strip()


def credentials_from_env() -> GreenApiCredentials | None:
    api_url = _clean(settings.GREEN_API_URL)
    id_instance = _clean(settings.GREEN_API_ID_INSTANCE)
    api_token = _clean(settings.GREEN_API_TOKEN_INSTANCE)
    if api_url and id_instance and api_token:
        return GreenApiCredentials(
            api_url=api_url,
            id_instance=id_instance,
            api_token=api_token,
        )
    return None


def credentials_from_organization(organization) -> GreenApiCredentials | None:
    if organization is None:
        return None
    api_url = _clean(getattr(organization, "green_api_url", None))
    id_instance = _clean(getattr(organization, "green_api_id_instance", None))
    api_token = _clean(getattr(organization, "green_api_token_instance", None))
    if api_url and id_instance and api_token:
        return GreenApiCredentials(
            api_url=api_url,
            id_instance=id_instance,
            api_token=api_token,
        )
    return None


def resolve_credentials(organization=None) -> GreenApiCredentials | None:
    """Сначала ключи организации, иначе env (Timeweb)."""
    return credentials_from_organization(organization) or credentials_from_env()


def is_green_api_configured(organization=None) -> bool:
    return resolve_credentials(organization) is not None


def phone_to_chat_id(phone: str) -> str | None:
    """E.164 digits → chatId вида 79001234567@c.us."""
    digits = normalize_phone(phone)
    if len(digits) == 10:
        digits = f"7{digits}"
    if len(digits) != 11 or not digits.startswith("7"):
        return None
    return f"{digits}@c.us"


def send_text_message(
    phone: str,
    message: str,
    *,
    credentials: GreenApiCredentials | None = None,
    organization=None,
    timeout: float = 30.0,
) -> GreenApiSendResult:
    creds = credentials or resolve_credentials(organization)
    if creds is None:
        raise GreenApiNotConfiguredError("Green API не настроен")

    chat_id = phone_to_chat_id(phone)
    if chat_id is None:
        raise GreenApiError("Некорректный номер телефона")

    base = creds.api_url.rstrip("/")
    url = f"{base}/waInstance{creds.id_instance}/sendMessage/{creds.api_token}"
    try:
        with httpx.Client(timeout=timeout) as client:
            response = client.post(url, json={"chatId": chat_id, "message": message})
    except httpx.HTTPError as exc:
        raise GreenApiError(f"Сеть Green API: {exc}") from exc

    if response.status_code >= 400:
        detail = (response.text or "").strip()[:300]
        raise GreenApiError(f"Green API HTTP {response.status_code}: {detail or 'ошибка'}")

    try:
        payload = response.json()
    except ValueError as exc:
        raise GreenApiError("Green API вернул не-JSON") from exc

    id_message = payload.get("idMessage") if isinstance(payload, dict) else None
    if not id_message:
        raise GreenApiError("Green API не вернул idMessage")
    return GreenApiSendResult(id_message=str(id_message))
