"""Клиент Green API: отправка текстовых WhatsApp-сообщений."""

from __future__ import annotations

from dataclasses import dataclass

import httpx

from app.core.config import settings
from app.services.phone import normalize_phone


class GreenApiNotConfiguredError(RuntimeError):
    """В env не заданы URL / idInstance / token."""


class GreenApiError(RuntimeError):
    """Ошибка ответа или сети Green API."""


@dataclass(frozen=True, slots=True)
class GreenApiSendResult:
    id_message: str | None


def is_green_api_configured() -> bool:
    return bool(
        settings.GREEN_API_URL.strip()
        and settings.GREEN_API_ID_INSTANCE.strip()
        and settings.GREEN_API_TOKEN_INSTANCE.strip()
    )


def phone_to_chat_id(phone: str) -> str | None:
    """E.164 digits → chatId вида 79001234567@c.us."""
    digits = normalize_phone(phone)
    if len(digits) == 10:
        digits = f"7{digits}"
    if len(digits) != 11 or not digits.startswith("7"):
        return None
    return f"{digits}@c.us"


def send_text_message(phone: str, message: str, *, timeout: float = 30.0) -> GreenApiSendResult:
    if not is_green_api_configured():
        raise GreenApiNotConfiguredError("Green API не настроен")

    chat_id = phone_to_chat_id(phone)
    if chat_id is None:
        raise GreenApiError("Некорректный номер телефона")

    base = settings.GREEN_API_URL.rstrip("/")
    url = (
        f"{base}/waInstance{settings.GREEN_API_ID_INSTANCE.strip()}"
        f"/sendMessage/{settings.GREEN_API_TOKEN_INSTANCE.strip()}"
    )
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
