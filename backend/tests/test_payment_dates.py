import uuid
from datetime import date
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import MagicMock

from app.services.payment_dates import align_client_payment_dates


CLIENT_ID = uuid.UUID("cccccccc-cccc-cccc-cccc-cccccccccccc")
SCHEDULE_ID = uuid.UUID("dddddddd-dddd-dddd-dddd-dddddddddddd")
PAYMENT_ID = uuid.UUID("eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee")
MANDATORY_ID = uuid.UUID("ffffffff-ffff-ffff-ffff-ffffffffffff")
RECORD_ID = uuid.UUID("11111111-1111-1111-1111-111111111111")


def make_client(contract_date: date = date(2024, 3, 15)) -> SimpleNamespace:
    return SimpleNamespace(id=CLIENT_ID, contract_date=contract_date)


class TestAlignClientPaymentDates:
    def test_aligns_schedule_and_mandatory_dates(self, monkeypatch):
        client = make_client()
        schedule = SimpleNamespace(
            id=SCHEDULE_ID,
            due_date=date(2024, 4, 15),
            deferred_until=None,
        )
        payment = SimpleNamespace(
            id=PAYMENT_ID,
            client_id=CLIENT_ID,
            payment_schedule_id=SCHEDULE_ID,
            payment_date=date(2026, 7, 21),
            is_deleted=False,
            is_refund=False,
        )
        mandatory = SimpleNamespace(
            id=MANDATORY_ID,
            client_id=CLIENT_ID,
            paid_amount=Decimal("25000.00"),
            paid_date=date(2026, 7, 21),
        )
        record = SimpleNamespace(
            id=RECORD_ID,
            mandatory_payment_id=MANDATORY_ID,
            payment_date=date(2026, 7, 21),
        )

        db = MagicMock()
        db.scalars.side_effect = [
            [payment],
            [schedule],
            [record],
            [mandatory],
        ]
        db.scalar.return_value = date(2024, 3, 15)
        monkeypatch.setattr(
            "app.services.payment_dates.sync_client_payment_schedules",
            lambda *_args, **_kwargs: None,
        )

        schedule_updated, mandatory_updated = align_client_payment_dates(db, client)

        assert schedule_updated == 1
        assert mandatory_updated == 1
        assert payment.payment_date == date(2024, 4, 15)
        assert record.payment_date == date(2024, 3, 15)
        assert mandatory.paid_date == date(2024, 3, 15)
