import pytest

from app.services.validation import (
    INVALID_FULL_NAME,
    INVALID_PASSPORT,
    validate_address,
    validate_full_name,
    validate_passport,
    validate_phone_optional,
    validate_phone_required,
)


def test_validate_full_name_ok() -> None:
    assert validate_full_name("Иванов Иван") == "Иванов Иван"


def test_validate_full_name_rejects_digits() -> None:
    with pytest.raises(ValueError, match="цифры"):
        validate_full_name("Иванов Иван 1")


def test_validate_full_name_rejects_single_word() -> None:
    with pytest.raises(ValueError, match=INVALID_FULL_NAME):
        validate_full_name("Иванов")


def test_validate_phone_required_ok() -> None:
    assert validate_phone_required("+79281234567") == "+79281234567"


def test_validate_phone_required_prefix() -> None:
    with pytest.raises(ValueError, match=r"\+7"):
        validate_phone_required("89281234567")


def test_validate_phone_optional_empty() -> None:
    assert validate_phone_optional(None) is None
    assert validate_phone_optional("") is None
    assert validate_phone_optional("   ") is None


def test_validate_passport_ok() -> None:
    assert validate_passport("1234 567890") == "12 34 567890"
    assert validate_passport("1234567890") == "12 34 567890"


def test_validate_passport_rejects_short() -> None:
    with pytest.raises(ValueError, match="00 00"):
        validate_passport("123456")


def test_validate_address_ok() -> None:
    assert validate_address("г. Москва, ул. Ленина, 10") == "г. Москва, ул. Ленина, 10"


def test_validate_address_rejects_digits_only() -> None:
    with pytest.raises(ValueError):
        validate_address("123456789")
