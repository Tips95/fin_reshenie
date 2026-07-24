from types import SimpleNamespace
from unittest.mock import MagicMock

import uuid

from app.services.client_duplicates import (
    find_existing_client,
    norm_name,
    phone_has_minimum_digits,
    phones_equivalent,
)

ORG_ID = uuid.UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")


class TestPhonesEquivalent:
    def test_same_formatted_phone(self):
        assert phones_equivalent("+7 928 000-00-01", "+7 928 000-00-01") is True

    def test_eight_and_seven_prefix(self):
        assert phones_equivalent("8 (928) 000-00-01", "+7 928 000-00-01") is True

    def test_digits_only(self):
        assert phones_equivalent("79280000001", "89280000001") is True

    def test_different_phones(self):
        assert phones_equivalent("+7 928 000-00-01", "+7 928 000-00-02") is False

    def test_empty_phone(self):
        assert phones_equivalent("", "+7 928 000-00-01") is False


class TestNormName:
    def test_collapses_spaces_and_case(self):
        assert norm_name("  Иванов   Иван ") == "иванов иван"


class TestFindExistingClient:
    def test_finds_by_normalized_name(self):
        existing = SimpleNamespace(
            id=uuid.uuid4(),
            phone="+7 999 111-22-33",
            full_name="Петров Петр",
        )
        db = MagicMock()
        db.scalars.return_value = [existing]

        found = find_existing_client(
            db,
            organization_id=ORG_ID,
            phone="+7 928 000-00-01",
            full_name="  петров   петр ",
        )

        assert found is existing

    def test_finds_by_equivalent_phone(self):
        existing = SimpleNamespace(
            id=uuid.uuid4(),
            phone="8 (928) 000-00-01",
            full_name="Сидоров",
        )
        db = MagicMock()
        db.scalars.return_value = [existing]

        found = find_existing_client(
            db,
            organization_id=ORG_ID,
            phone="+7 928 000-00-01",
            full_name="Новый клиент",
        )

        assert found is existing

    def test_skips_when_phone_incomplete(self):
        db = MagicMock()
        db.scalars.return_value = [
            SimpleNamespace(
                id=uuid.uuid4(),
                phone="+7 928 000-00-01",
                full_name="Иванов",
            )
        ]

        found = find_existing_client(
            db,
            organization_id=ORG_ID,
            phone="+7",
            full_name="Иванов",
        )

        assert found is None
        db.scalars.assert_not_called()


class TestPhoneHasMinimumDigits:
    def test_accepts_full_phone(self):
        assert phone_has_minimum_digits("+7 928 000-00-01") is True

    def test_rejects_prefix_only(self):
        assert phone_has_minimum_digits("+7") is False
