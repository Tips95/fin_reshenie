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


def _db_with(*clients: SimpleNamespace) -> MagicMock:
    """Сессия, где в базе только эти клиенты: лёгкая выборка + db.get по id."""
    db = MagicMock()
    db.execute.return_value = [(item.id, item.phone, item.full_name) for item in clients]
    by_id = {item.id: item for item in clients}
    db.get.side_effect = lambda _model, client_id: by_id.get(client_id)
    return db


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
        db = _db_with(existing)

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
        db = _db_with(existing)

        found = find_existing_client(
            db,
            organization_id=ORG_ID,
            phone="+7 928 000-00-01",
            full_name="Новый клиент",
        )

        assert found is existing

    def test_loads_only_the_matching_client(self):
        other = SimpleNamespace(id=uuid.uuid4(), phone="+7 999 000-00-09", full_name="Другой")
        existing = SimpleNamespace(id=uuid.uuid4(), phone="+7 928 000-00-01", full_name="Сидоров")
        db = _db_with(other, existing)

        find_existing_client(
            db,
            organization_id=ORG_ID,
            phone="+7 928 000-00-01",
            full_name="Новый клиент",
        )

        db.scalars.assert_not_called()
        db.get.assert_called_once()
        assert db.get.call_args.args[1] == existing.id

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
        db.execute.assert_not_called()


class TestPhoneHasMinimumDigits:
    def test_accepts_full_phone(self):
        assert phone_has_minimum_digits("+7 928 000-00-01") is True

    def test_rejects_prefix_only(self):
        assert phone_has_minimum_digits("+7") is False
