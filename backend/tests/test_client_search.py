"""Поиск клиентов: телефон 8/+7 и поиск без фильтра месяца."""

import uuid
from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.models import Base, Client, Organization, User
from app.models.enums import (
    ClientStatus,
    EngagementStage,
    OrganizationType,
    ProcedureStage,
    UserRole,
)
from app.services.client_duplicates import (
    duplicate_client_message,
    duplicate_client_payload,
    find_existing_client,
)
from app.services.client_list import query_clients


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


def _add_client(db, organization_id, *, full_name, phone, engagement_stage):
    client = Client(
        id=uuid.uuid4(),
        organization_id=organization_id,
        full_name=full_name,
        phone=phone,
        contract_date=date(2026, 1, 15),
        debt_amount=Decimal("400000.00"),
        status=ClientStatus.ACTIVE,
        engagement_stage=engagement_stage,
        procedure_stage=ProcedureStage.CONTRACT_SIGNED,
    )
    db.add(client)
    db.flush()
    return client


class TestClientPhoneSearch:
    def test_finds_eight_prefix_when_searching_plus_seven(self, db):
        organization, owner = _seed_owner(db)
        client = _add_client(
            db,
            organization.id,
            full_name="Дигаев Али",
            phone="89286433230",
            engagement_stage=EngagementStage.BANKRUPTCY,
        )

        found = query_clients(db, owner, phone="+7 928 643-32-30")
        assert [item.id for item in found] == [client.id]

    def test_finds_plus_seven_when_searching_eight(self, db):
        organization, owner = _seed_owner(db)
        client = _add_client(
            db,
            organization.id,
            full_name="Кадиев Ричард",
            phone="+79281112233",
            engagement_stage=EngagementStage.DOCUMENT_COLLECTION,
        )

        found = query_clients(db, owner, phone="89281112233")
        assert [item.id for item in found] == [client.id]


class TestClientSearchIgnoresWorkspaceFilters:
    def test_name_search_finds_collection_client_from_contracts_view(self, db):
        organization, owner = _seed_owner(db)
        client = _add_client(
            db,
            organization.id,
            full_name="Дигаев Али Магомедович",
            phone="+79286433230",
            engagement_stage=EngagementStage.DOCUMENT_COLLECTION,
        )

        # Как на странице «Договоры»: этап банкротства + месяц платежа.
        # Поиск по ФИО должен всё равно найти человека на сборе.
        found = query_clients(
            db,
            owner,
            name="Дигаев Али",
            engagement_stage=EngagementStage.BANKRUPTCY,
            due_month="2026-07",
        )
        assert [item.id for item in found] == [client.id]

    def test_without_search_contracts_filter_hides_collection_client(self, db):
        organization, owner = _seed_owner(db)
        _add_client(
            db,
            organization.id,
            full_name="Дигаев Али",
            phone="+79286433230",
            engagement_stage=EngagementStage.DOCUMENT_COLLECTION,
        )

        found = query_clients(
            db,
            owner,
            engagement_stage=EngagementStage.BANKRUPTCY,
        )
        assert found == []


class TestDuplicateMessage:
    def test_points_to_collection_section(self, db):
        organization, _owner = _seed_owner(db)
        client = _add_client(
            db,
            organization.id,
            full_name="Кадиев Ричард",
            phone="89280001122",
            engagement_stage=EngagementStage.DOCUMENT_COLLECTION,
        )
        message = duplicate_client_message(client)
        assert "Кадиев Ричард" in message
        assert "сбор документов" in message
        payload = duplicate_client_payload(client)
        assert payload["client_id"] == str(client.id)
        assert payload["code"] == "duplicate_client"

    def test_duplicate_check_matches_eight_and_seven(self, db):
        organization, _owner = _seed_owner(db)
        _add_client(
            db,
            organization.id,
            full_name="Дигаев Али",
            phone="89286433230",
            engagement_stage=EngagementStage.BANKRUPTCY,
        )
        existing = find_existing_client(
            db,
            organization_id=organization.id,
            phone="+79286433230",
            full_name="Кто-то Другой",
        )
        assert existing is not None
        assert existing.full_name == "Дигаев Али"
