"""Неотданные обязательные платежи и клиенты без вписанного депозита."""

import uuid
from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.models import Base, Client, Organization, User
from app.models.client_mandatory_payment import ClientMandatoryPayment
from app.models.enums import (
    ClientStatus,
    EngagementStage,
    MandatoryPaymentStatus,
    MandatoryPaymentType,
    OrganizationType,
    ProcedureStage,
    UserRole,
)
from app.models.payment import Payment
from app.services.mandatory_payment_stats import (
    get_clients_missing_deposit,
    get_mandatory_pending_totals,
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
        id=uuid.uuid4(), name="Тест", organization_type=OrganizationType.BANKRUPTCY
    )
    owner = User(
        id=uuid.uuid4(),
        organization_id=organization.id,
        full_name="Руководитель",
        email="owner@test.ru",
        phone=None,
        password_hash="x",
        role=UserRole.OWNER,
        is_active=True,
    )
    db.add_all([organization, owner])
    db.flush()
    return organization, owner


def _client(db, organization_id, name, phone):
    client = Client(
        id=uuid.uuid4(),
        organization_id=organization_id,
        full_name=name,
        phone=phone,
        contract_date=date(2026, 11, 1),
        debt_amount=Decimal("400000.00"),
        status=ClientStatus.ACTIVE,
        engagement_stage=EngagementStage.BANKRUPTCY,
        procedure_stage=ProcedureStage.CONTRACT_SIGNED,
    )
    db.add(client)
    db.flush()
    return client


def _mandatory(db, client_id, payment_type, planned, paid="0.00", applicable=True):
    db.add(
        ClientMandatoryPayment(
            client_id=client_id,
            payment_type=payment_type,
            planned_amount=Decimal(planned),
            paid_amount=Decimal(paid),
            status=MandatoryPaymentStatus.PENDING,
            is_applicable=applicable,
        )
    )


def _payment(db, client_id, owner_id, *, is_refund=False, is_deleted=False):
    db.add(
        Payment(
            client_id=client_id,
            amount=Decimal("30000.00"),
            payment_date=date(2026, 11, 3),
            created_by=owner_id,
            is_refund=is_refund,
            is_deleted=is_deleted,
        )
    )


def test_pending_counts_only_unpaid_rest_of_applicable_items(db):
    organization, _ = _seed(db)
    first = _client(db, organization.id, "Иванов", "89280000001")
    second = _client(db, organization.id, "Петров", "89280000002")
    _mandatory(db, first.id, MandatoryPaymentType.DEPOSIT, "25000.00", paid="10000.00")
    _mandatory(db, first.id, MandatoryPaymentType.FINANCIAL_MANAGEMENT, "21000.00")
    _mandatory(db, second.id, MandatoryPaymentType.DEPOSIT, "35000.00", paid="35000.00")
    _mandatory(db, second.id, MandatoryPaymentType.FINANCIAL_MANAGEMENT, "11000.00")
    _mandatory(db, second.id, MandatoryPaymentType.COURT_FEE, "300.00", applicable=False)
    db.flush()

    totals = get_mandatory_pending_totals(db, [first.id, second.id])

    assert totals.deposit == Decimal("15000.00")
    assert totals.financial_management == Decimal("32000.00")
    assert totals.court_fee == Decimal("0.00")
    assert totals.total == Decimal("47000.00")


def test_missing_deposit_only_for_paying_clients_without_amount(db):
    organization, owner = _seed(db)
    paying_empty = _client(db, organization.id, "Без депозита", "89280000011")
    paying_set = _client(db, organization.id, "С депозитом", "89280000012")
    not_paying = _client(db, organization.id, "Ещё не платил", "89280000013")
    refunded = _client(db, organization.id, "Только возврат", "89280000014")
    for client, planned in (
        (paying_empty, "0.00"),
        (paying_set, "25000.00"),
        (not_paying, "0.00"),
        (refunded, "0.00"),
    ):
        _mandatory(db, client.id, MandatoryPaymentType.DEPOSIT, planned)
    _payment(db, paying_empty.id, owner.id)
    _payment(db, paying_set.id, owner.id)
    _payment(db, refunded.id, owner.id, is_refund=True)
    _payment(db, not_paying.id, owner.id, is_deleted=True)
    db.flush()

    missing = get_clients_missing_deposit(
        db, [paying_empty.id, paying_set.id, not_paying.id, refunded.id]
    )

    assert missing == [paying_empty.id]
