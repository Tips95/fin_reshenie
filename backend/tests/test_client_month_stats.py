from datetime import date
from decimal import Decimal
from types import SimpleNamespace
from uuid import uuid4

from app.models.enums import PaymentScheduleStatus
from app.services.client_month_stats import compute_due_month_stats


def test_compute_due_month_stats_aggregates_month_rows():
    client_id = uuid4()
    plan_id = uuid4()
    db = SimpleNamespace()

    schedule_due = SimpleNamespace(
        installment_plan_id=plan_id,
        deferred_until=None,
        due_date=date(2026, 7, 25),
        planned_amount=Decimal("10000.00"),
        paid_amount=Decimal("3000.00"),
    )
    schedule_future = SimpleNamespace(
        installment_plan_id=plan_id,
        deferred_until=None,
        due_date=date(2026, 8, 25),
        planned_amount=Decimal("10000.00"),
        paid_amount=Decimal("0.00"),
    )
    payment = SimpleNamespace(
        client_id=client_id,
        amount=Decimal("3000.00"),
        is_refund=False,
        payment_date=date(2026, 7, 10),
        is_deleted=False,
    )

    class FakeScalars:
        def __init__(self, items):
            self.items = items

        def __iter__(self):
            return iter(self.items)

    calls = {"n": 0}

    def fake_scalars(stmt):
        calls["n"] += 1
        if calls["n"] == 1:
            return FakeScalars(
                [
                    SimpleNamespace(
                        id=plan_id,
                        client_id=client_id,
                    )
                ]
            )
        if calls["n"] == 2:
            return FakeScalars([schedule_due, schedule_future])
        return FakeScalars([payment])

    db.scalars = fake_scalars

    summary, per_client = compute_due_month_stats(db, [client_id], "2026-07")

    assert summary.clients_count == 1
    assert summary.planned_total == Decimal("10000.00")
    assert summary.remainder_total == Decimal("7000.00")
    assert summary.collected_total == Decimal("3000.00")
    assert summary.unpaid_due_count == 1
    assert summary.payments_remaining_total == 2
    assert per_client[client_id].payments_remaining == 2
