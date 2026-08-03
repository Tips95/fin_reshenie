"""Обязательные платежи: ручные суммы и вычет по дате записи."""

from decimal import Decimal
from uuid import uuid4

from app.models.enums import MandatoryPaymentType
from app.services.mandatory_payments import create_default_mandatory_payments


class TestMandatoryDefaults:
    def test_deposit_starts_at_zero(self):
        items = create_default_mandatory_payments(uuid4())
        deposit = next(item for item in items if item.payment_type == MandatoryPaymentType.DEPOSIT)
        assert deposit.planned_amount == Decimal("0.00")
        assert all(item.planned_amount == Decimal("0.00") for item in items)
