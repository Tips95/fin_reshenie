"""Latest schedule notes on the contracts list."""

import uuid
from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.models import Base, Client, InstallmentPlan, Organization, PaymentSchedule
from app.models.enums import (
    ClientStatus,
    EngagementStage,
    OrganizationType,
    PaymentScheduleStatus,
    ProcedureStage,
)
from app.services.client_list import clients_latest_notes_map


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


def _seed_org(db):
    organization = Organization(
        id=uuid.uuid4(),
        name="Тест",
        organization_type=OrganizationType.BANKRUPTCY,
    )
    db.add(organization)
    db.flush()
    return organization


def _add_client(db, organization_id):
    client = Client(
        id=uuid.uuid4(),
        organization_id=organization_id,
        full_name="Иванов Иван",
        phone="+79001112233",
        contract_date=date(2026, 1, 15),
        debt_amount=Decimal("400000.00"),
        status=ClientStatus.ACTIVE,
        engagement_stage=EngagementStage.BANKRUPTCY,
        procedure_stage=ProcedureStage.CONTRACT_SIGNED,
    )
    db.add(client)
    db.flush()
    return client


def _add_plan(db, client_id):
    plan = InstallmentPlan(
        id=uuid.uuid4(),
        client_id=client_id,
        pricing_tier_id=None,
        total_amount=Decimal("160000.00"),
        start_date=date(2026, 1, 15),
        total_months=2,
    )
    db.add(plan)
    db.flush()
    return plan


def _add_schedule(db, plan_id, *, month_number, due_date, note):
    item = PaymentSchedule(
        id=uuid.uuid4(),
        installment_plan_id=plan_id,
        month_number=month_number,
        due_date=due_date,
        planned_amount=Decimal("10000.00"),
        paid_amount=Decimal("0.00"),
        status=PaymentScheduleStatus.PENDING,
        manager_note=note,
    )
    db.add(item)
    db.flush()
    return item


class TestClientsLatestNotesMap:
    def test_picks_latest_note_and_counts_the_rest(self, db):
        organization = _seed_org(db)
        client = _add_client(db, organization.id)
        plan = _add_plan(db, client.id)
        _add_schedule(db, plan.id, month_number=1, due_date=date(2026, 7, 30), note="обещал в июле")
        _add_schedule(db, plan.id, month_number=2, due_date=date(2026, 8, 30), note="просит отсрочку")

        result = clients_latest_notes_map(db, [client.id])

        assert result[client.id] == ("просит отсрочку", 2)

    def test_prefers_note_for_selected_due_month(self, db):
        organization = _seed_org(db)
        client = _add_client(db, organization.id)
        plan = _add_plan(db, client.id)
        _add_schedule(db, plan.id, month_number=1, due_date=date(2026, 7, 30), note="июль")
        _add_schedule(db, plan.id, month_number=2, due_date=date(2026, 8, 30), note="август")

        result = clients_latest_notes_map(db, [client.id], due_month="2026-07")

        assert result[client.id] == ("июль", 2)

    def test_skips_empty_notes(self, db):
        organization = _seed_org(db)
        client = _add_client(db, organization.id)
        other = _add_client(db, organization.id)
        plan = _add_plan(db, client.id)
        _add_schedule(db, plan.id, month_number=1, due_date=date(2026, 7, 30), note="   ")

        result = clients_latest_notes_map(db, [client.id, other.id])

        assert result[client.id] == (None, 0)
        assert result[other.id] == (None, 0)
