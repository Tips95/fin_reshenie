import uuid
from datetime import date
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import MagicMock

from app.services.payment_dates import realign_client_legacy_finances
from app.services.payment_sync import sync_client_payment_schedules
from app.services.schedule_rebuild import rebuild_schedule_dates_from_contract


CLIENT_ID = uuid.UUID("cccccccc-cccc-cccc-cccc-cccccccccccc")
PLAN_ID = uuid.UUID("dddddddd-dddd-dddd-dddd-dddddddddddd")
SCHEDULE_FEB = uuid.UUID("eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee")
SCHEDULE_MAR = uuid.UUID("ffffffff-ffff-ffff-ffff-ffffffffffff")
PAYMENT_ID = uuid.UUID("11111111-1111-1111-1111-111111111111")


def make_client(contract_date: date = date(2024, 2, 10)) -> SimpleNamespace:
    return SimpleNamespace(id=CLIENT_ID, contract_date=contract_date)


class TestScheduleRebuild:
    def test_rebuilds_months_from_contract_date(self):
        client = make_client(date(2024, 2, 10))
        plan = SimpleNamespace(id=PLAN_ID, client_id=CLIENT_ID, start_date=date(2026, 7, 1))
        schedules = [
            SimpleNamespace(id=SCHEDULE_FEB, month_number=1, due_date=date(2026, 7, 10)),
            SimpleNamespace(id=SCHEDULE_MAR, month_number=2, due_date=date(2026, 8, 10)),
        ]

        db = MagicMock()
        db.scalar.return_value = plan
        db.scalars.return_value = schedules

        updated = rebuild_schedule_dates_from_contract(db, client)

        assert updated == 2
        assert plan.start_date == date(2024, 2, 10)
        assert schedules[0].due_date == date(2024, 2, 10)
        assert schedules[1].due_date == date(2024, 3, 10)


class TestPaymentSyncMonthMatch:
    def test_applies_unlinked_payment_to_matching_month(self, monkeypatch):
        schedules = [
            SimpleNamespace(
                id=SCHEDULE_FEB,
                month_number=1,
                due_date=date(2024, 2, 10),
                deferred_until=None,
                planned_amount=Decimal("20000.00"),
                paid_amount=Decimal("0.00"),
                status="pending",
                paid_date=None,
            ),
            SimpleNamespace(
                id=SCHEDULE_MAR,
                month_number=2,
                due_date=date(2024, 3, 10),
                deferred_until=None,
                planned_amount=Decimal("30000.00"),
                paid_amount=Decimal("0.00"),
                status="pending",
                paid_date=None,
            ),
        ]
        payment = SimpleNamespace(
            client_id=CLIENT_ID,
            payment_schedule_id=None,
            amount=Decimal("30000.00"),
            payment_date=date(2024, 3, 5),
            is_refund=False,
            is_deleted=False,
        )
        plan = SimpleNamespace(id=PLAN_ID, client_id=CLIENT_ID)

        db = MagicMock()
        db.scalar.return_value = plan
        db.scalars.side_effect = [schedules, [payment]]

        sync_client_payment_schedules(db, CLIENT_ID)

        assert schedules[0].paid_amount == Decimal("0.00")
        assert schedules[1].paid_amount == Decimal("30000.00")


class TestRealignClientLegacyFinances:
    def test_runs_rebuild_sync_and_align(self, monkeypatch):
        client = make_client()
        monkeypatch.setattr(
            "app.services.payment_dates.rebuild_schedule_dates_from_contract",
            lambda *_args, **_kwargs: 2,
        )
        monkeypatch.setattr(
            "app.services.payment_dates.sync_client_payment_schedules",
            lambda *_args, **_kwargs: None,
        )
        monkeypatch.setattr(
            "app.services.payment_dates._align_schedule_payment_dates",
            lambda *_args, **_kwargs: 3,
        )
        monkeypatch.setattr(
            "app.services.payment_dates._align_mandatory_records",
            lambda *_args, **_kwargs: 1,
        )

        result = realign_client_legacy_finances(MagicMock(), client)

        assert result == (2, 3, 1)
