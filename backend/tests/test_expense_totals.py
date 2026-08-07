import uuid
from datetime import date
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import MagicMock

from app.services.expense_totals import monthly_expenses_total


ORG_ID = uuid.UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")


def test_monthly_expenses_total_sums_fixed_and_one_time(monkeypatch):
    db = MagicMock()
    monkeypatch.setattr(
        "app.services.expense_totals.fixed_monthly_expenses_total",
        lambda *_args, **_kwargs: Decimal("50000.00"),
    )
    monkeypatch.setattr(
        "app.services.expense_totals.one_time_expenses_total",
        lambda *_args, **_kwargs: Decimal("7500.00"),
    )

    total, fixed, one_time = monthly_expenses_total(
        db,
        ORG_ID,
        month_start=date(2026, 8, 1),
        month_end=date(2026, 8, 31),
    )

    assert total == Decimal("57500.00")
    assert fixed == Decimal("50000.00")
    assert one_time == Decimal("7500.00")
