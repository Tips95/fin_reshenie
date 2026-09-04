"""Фильтр «оплатили сбор в месяце» — та же выборка, что за счётчиком дашборда."""

import uuid
from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.models import Base, Client, Organization, User
from app.models.document_collection import DocumentCollection
from app.models.enums import (
    ClientStatus,
    DocumentCollectionStatus,
    EngagementStage,
    OrganizationType,
    ProcedureStage,
    UserRole,
)
from app.services.client_list import CollectionViewFilter, query_clients
from app.services.document_collection_stats import get_document_collection_paid_totals


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


def _seed_owner(db):
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


_phone_counter = 0


def _next_phone() -> str:
    global _phone_counter
    _phone_counter += 1
    return f"8928{_phone_counter:07d}"


def _add_paid_client(db, organization_id, *, full_name, paid_date, engagement_stage):
    client = Client(
        id=uuid.uuid4(),
        organization_id=organization_id,
        full_name=full_name,
        phone=_next_phone(),
        contract_date=date(2026, 1, 15),
        debt_amount=Decimal("400000.00"),
        status=ClientStatus.ACTIVE,
        engagement_stage=engagement_stage,
        procedure_stage=ProcedureStage.CONTRACT_SIGNED,
    )
    db.add(client)
    db.flush()
    db.add(
        DocumentCollection(
            id=uuid.uuid4(),
            client_id=client.id,
            status=DocumentCollectionStatus.PAID,
            paid_date=paid_date,
        )
    )
    db.flush()
    return client


class TestCollectionPaidMonth:
    def test_includes_clients_already_moved_to_bankruptcy(self, db):
        """Именно из-за них вкладка «Оплатили сбор» показывает меньше, чем дашборд."""
        organization, owner = _seed_owner(db)
        still_collecting = _add_paid_client(
            db,
            organization.id,
            full_name="Остался на сборе",
            paid_date=date(2026, 9, 10),
            engagement_stage=EngagementStage.DOCUMENT_COLLECTION,
        )
        converted = _add_paid_client(
            db,
            organization.id,
            full_name="Переведён на банкротство",
            paid_date=date(2026, 9, 12),
            engagement_stage=EngagementStage.BANKRUPTCY,
        )

        drilldown = query_clients(
            db,
            owner,
            collection_view=CollectionViewFilter.ALL,
            collection_paid_month="2026-09",
        )
        paid_tab = query_clients(
            db,
            owner,
            collection_view=CollectionViewFilter.PAID,
        )

        assert {item.id for item in drilldown} == {still_collecting.id, converted.id}
        assert {item.id for item in paid_tab} == {still_collecting.id}

    def test_excludes_payment_moved_to_another_month(self, db):
        organization, owner = _seed_owner(db)
        _add_paid_client(
            db,
            organization.id,
            full_name="Оплата перенесена в октябрь",
            paid_date=date(2026, 10, 2),
            engagement_stage=EngagementStage.DOCUMENT_COLLECTION,
        )
        stayed = _add_paid_client(
            db,
            organization.id,
            full_name="Оплата осталась в сентябре",
            paid_date=date(2026, 9, 30),
            engagement_stage=EngagementStage.DOCUMENT_COLLECTION,
        )

        found = query_clients(
            db,
            owner,
            collection_view=CollectionViewFilter.ALL,
            collection_paid_month="2026-09",
        )

        assert [item.id for item in found] == [stayed.id]

    def test_drilldown_matches_dashboard_counter(self, db):
        """Список и счётчик обязаны сходиться — иначе цифру нечем проверить."""
        organization, owner = _seed_owner(db)
        for index, (paid_date, stage) in enumerate(
            [
                (date(2026, 9, 1), EngagementStage.DOCUMENT_COLLECTION),
                (date(2026, 9, 15), EngagementStage.BANKRUPTCY),
                (date(2026, 10, 1), EngagementStage.DOCUMENT_COLLECTION),
            ]
        ):
            _add_paid_client(
                db,
                organization.id,
                full_name=f"Клиент {index}",
                paid_date=paid_date,
                engagement_stage=stage,
            )

        all_clients = query_clients(db, owner)
        totals = get_document_collection_paid_totals(
            db,
            [item.id for item in all_clients],
            date_from=date(2026, 9, 1),
            date_to=date(2026, 9, 30),
        )
        drilldown = query_clients(
            db,
            owner,
            collection_view=CollectionViewFilter.ALL,
            collection_paid_month="2026-09",
        )

        assert totals.paid_count == len(drilldown) == 2
