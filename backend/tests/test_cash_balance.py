"""Кубышка: ручной остаток на начало месяца и перенос в следующий."""

import uuid
from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.models import Base, CashBalance, Organization, User
from app.models.enums import OrganizationType, UserRole
from app.services.cash_balance import (
    get_cash_balance,
    next_month_key,
    set_cash_balance,
)


@pytest.fixture()
def db():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


def _seed(db):
    organization = Organization(
        id=uuid.uuid4(),
        name="Тест",
        organization_type=OrganizationType.BANKRUPTCY,
    )
    db.add(organization)
    owner = User(
        id=uuid.uuid4(),
        organization_id=organization.id,
        full_name="Руководитель Тест",
        email="owner@test.ru",
        phone=None,
        password_hash="x",
        role=UserRole.OWNER,
        is_active=True,
    )
    db.add(owner)
    db.flush()
    return organization, owner


class TestNextMonthKey:
    def test_moves_to_next_month(self):
        assert next_month_key("2026-09") == "2026-10"

    def test_rolls_over_the_year(self):
        assert next_month_key("2026-12") == "2027-01"


class TestSetCashBalance:
    def test_creates_balance_for_month(self, db):
        organization, owner = _seed(db)

        set_cash_balance(
            db,
            organization.id,
            "2026-09",
            opening_amount=Decimal("150000.00"),
            comment="  стартовый остаток  ",
            updated_by=owner.id,
        )

        stored = get_cash_balance(db, organization.id, "2026-09")
        assert stored.opening_amount == Decimal("150000.00")
        assert stored.period_month == date(2026, 9, 1)
        assert stored.comment == "стартовый остаток"

    def test_overwrites_existing_month(self, db):
        organization, owner = _seed(db)
        set_cash_balance(
            db,
            organization.id,
            "2026-09",
            opening_amount=Decimal("100000.00"),
            updated_by=owner.id,
        )

        set_cash_balance(
            db,
            organization.id,
            "2026-09",
            opening_amount=Decimal("120000.00"),
            updated_by=owner.id,
        )

        assert db.query(CashBalance).count() == 1
        assert get_cash_balance(db, organization.id, "2026-09").opening_amount == Decimal(
            "120000.00"
        )

    def test_months_are_independent(self, db):
        organization, owner = _seed(db)
        set_cash_balance(
            db,
            organization.id,
            "2026-09",
            opening_amount=Decimal("100000.00"),
            updated_by=owner.id,
        )
        set_cash_balance(
            db,
            organization.id,
            "2026-10",
            opening_amount=Decimal("180000.00"),
            updated_by=owner.id,
        )

        assert get_cash_balance(db, organization.id, "2026-09").opening_amount == Decimal(
            "100000.00"
        )
        assert get_cash_balance(db, organization.id, "2026-10").opening_amount == Decimal(
            "180000.00"
        )

    def test_missing_month_returns_none(self, db):
        organization, _ = _seed(db)

        assert get_cash_balance(db, organization.id, "2026-09") is None
