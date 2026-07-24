"""Shared field validation for API payloads."""

import re

from app.services.client_duplicates import INCOMPLETE_PHONE_MESSAGE, phone_has_minimum_digits

FULL_NAME_RE = re.compile(r"^[\u0401\u0451\u0410-\u044f\s\-']+$", re.UNICODE)

INVALID_FULL_NAME = "Укажите фамилию и имя, только буквы"
INVALID_PHONE_PREFIX = "Номер должен начинаться с +7"
INVALID_PASSPORT = "Паспорт: укажите серию и номер (формат 00 00 000000)"
INVALID_ADDRESS = "Укажите корректный адрес"
DIGITS_ONLY_NAME = "ФИО не должно содержать цифры"
PHONE_TOO_LONG = "Слишком длинный номер телефона"


def validate_full_name(value: str) -> str:
    normalized = " ".join(value.strip().split())
    if len(normalized) < 3:
        raise ValueError(INVALID_FULL_NAME)
    if any(ch.isdigit() for ch in normalized):
        raise ValueError(DIGITS_ONLY_NAME)
    if len(normalized.split()) < 2:
        raise ValueError(INVALID_FULL_NAME)
    if not FULL_NAME_RE.match(normalized):
        raise ValueError(INVALID_FULL_NAME)
    return normalized


def validate_phone_required(value: str) -> str:
    trimmed = value.strip()
    if not trimmed.startswith("+7"):
        raise ValueError(INVALID_PHONE_PREFIX)
    if not phone_has_minimum_digits(trimmed):
        raise ValueError(INCOMPLETE_PHONE_MESSAGE)
    digits = re.sub(r"\D", "", trimmed)
    if len(digits) > 11:
        raise ValueError(PHONE_TOO_LONG)
    return trimmed


def validate_phone_optional(value: str | None) -> str | None:
    if value is None:
        return None
    trimmed = value.strip()
    if not trimmed:
        return None
    return validate_phone_required(trimmed)


def format_passport_display(value: str) -> str:
    digits = re.sub(r"\D", "", value)
    if len(digits) != 10:
        return value.strip()
    return f"{digits[:2]} {digits[2:4]} {digits[4:]}"


def validate_passport(value: str) -> str:
    digits = re.sub(r"\D", "", value)
    if len(digits) != 10:
        raise ValueError(INVALID_PASSPORT)
    return format_passport_display(digits)


def validate_address(value: str) -> str:
    normalized = " ".join(value.strip().split())
    if len(normalized) < 5:
        raise ValueError(INVALID_ADDRESS)
    if normalized.isdigit():
        raise ValueError(INVALID_ADDRESS)
    return normalized
