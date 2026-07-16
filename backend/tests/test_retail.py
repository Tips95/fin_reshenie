from datetime import date
from decimal import Decimal
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.models.enums import UserRole
from app.services.retail_contracts import calculate_contract_amounts, create_retail_contract
from app.services.retail_term_rates import DEFAULT_RETAIL_TERM_RATES


class TestRetailCalculations:
    def test_markup_for_8_months(self):
        total, financed, monthly, _ = calculate_contract_amounts(
            product_price=Decimal("100000.00"),
            term_months=8,
            markup_percent=Decimal("40.00"),
            down_payment=Decimal("25000.00"),
        )
        assert total == Decimal("140000.00")
        assert financed == Decimal("115000.00")
        assert monthly == Decimal("14375.00")

    def test_default_term_rates_cover_6_to_12(self):
        months = [item[0] for item in DEFAULT_RETAIL_TERM_RATES]
        assert months == [6, 7, 8, 9, 10, 11, 12]


class TestRetailContractCreation:
    def test_investor_cannot_create_contract(self):
        user = SimpleNamespace(id=uuid4(), organization_id=uuid4(), role=UserRole.INVESTOR)
        db = SimpleNamespace()
        with pytest.raises(HTTPException) as exc:
            create_retail_contract(
                db,
                user,
                retail_client_id=uuid4(),
                investor_id=uuid4(),
                product_name="Телефон",
                product_price=Decimal("100000"),
                term_months=6,
                down_payment=Decimal("10000"),
                contract_date=date.today(),
            )
        assert exc.value.status_code == 403


def test_empty_dashboard_returns_zeros():
    from app.core.database import SessionLocal
    from app.models.user import User
    from sqlalchemy import select

    from app.services.retail_dashboard import get_retail_dashboard

    db = SessionLocal()
    try:
        user = db.scalar(select(User).where(User.email == "investor1@retail.local"))
        if user is None:
            pytest.skip("retail investor seed missing")
        summary = get_retail_dashboard(db, user)
        assert summary.contracts_count == 0
        assert summary.total_amount == Decimal("0.00")
    finally:
        db.close()
