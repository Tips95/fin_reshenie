import uuid
from datetime import date
from decimal import Decimal
from types import SimpleNamespace

from app.models.enums import MandatoryPaymentType
from app.services.mandatory_outflows import get_mandatory_outflows_overview

ORG_ID = uuid.uuid4()


def test_outflows_sum_deposit_and_finance_by_month():
    client_id = uuid.uuid4()
    rows = [
        (client_id, "Петров", MandatoryPaymentType.DEPOSIT, Decimal("25000.00"), date(2026, 11, 4)),
        (client_id, "Петров", MandatoryPaymentType.FINANCIAL_MANAGEMENT, Decimal("25000.00"), date(2026, 11, 18)),
        (uuid.uuid4(), "Сидоров", MandatoryPaymentType.DEPOSIT, Decimal("10000.00"), date(2026, 10, 2)),
        (uuid.uuid4(), "Скрытый", MandatoryPaymentType.COURT_FEE, Decimal("9000.00"), date(2026, 11, 1)),
    ]

    class _Result:
        def all(self):
            return rows

    db = SimpleNamespace(execute=lambda _stmt: _Result())
    user = SimpleNamespace(organization_id=ORG_ID)

    overview = get_mandatory_outflows_overview(db, user, month="2026-11")

    assert overview.deposit == Decimal("25000.00")
    assert overview.financial_management == Decimal("25000.00")
    assert overview.total == Decimal("50000.00")
    assert len(overview.items) == 2
    assert all(item.payment_type != "court_fee" for item in overview.items)
    assert len(overview.history) == 12
    october = next(item for item in overview.history if item.month == "2026-10")
    assert october.deposit == Decimal("10000.00")
    assert october.financial_management == Decimal("0.00")
    empty = next(item for item in overview.history if item.month == "2026-01")
    assert empty.total == Decimal("0.00")
