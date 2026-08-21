from datetime import date
from decimal import Decimal

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.models import Base, Client, ClientQuestionnaire, Organization, User
from app.models.enums import EngagementStage, OrganizationType, UserRole
from app.schemas.questionnaire import QuestionnaireCreate
from app.services.questionnaire_defaults import empty_debts
from app.services.questionnaire_pdf import build_questionnaire_pdf, display_or_absent
from app.services.questionnaires import (
    create_questionnaire,
    get_organization_questionnaire,
    list_questionnaires,
    to_questionnaire_response,
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


def _org_user(
    db,
    org_type: OrganizationType = OrganizationType.BANKRUPTCY,
    *,
    role: UserRole = UserRole.MANAGER,
    email: str = "manager@test.local",
    full_name: str = "Менеджер Тестов",
    organization: Organization | None = None,
):
    if organization is None:
        organization = Organization(name="Решение", organization_type=org_type)
        db.add(organization)
        db.flush()
    user = User(
        organization_id=organization.id,
        full_name=full_name,
        email=email,
        password_hash="x",
        role=role,
    )
    db.add(user)
    db.flush()
    user.organization = organization
    return user


def _client(db, organization_id, *, assigned_manager_id, full_name="Клиент Тестов"):
    client = Client(
        organization_id=organization_id,
        assigned_manager_id=assigned_manager_id,
        full_name=full_name,
        phone="+79280000000",
        contract_date=date(2026, 1, 15),
        debt_amount=Decimal("0.00"),
        engagement_stage=EngagementStage.BANKRUPTCY,
    )
    db.add(client)
    db.flush()
    return client


def _minimal_payload(**overrides):
    payload = QuestionnaireCreate(
        full_name="Иванов Иван",
        phone="+7 928 000-00-00",
    )
    return payload.model_copy(update=overrides)


class TestQuestionnaireDefaults:
    def test_debts_have_four_blank_rows(self):
        assert len(empty_debts()) == 4


class TestQuestionnairePersistence:
    def test_create_does_not_require_client(self, db):
        user = _org_user(db)
        payload = QuestionnaireCreate(
            full_name="Иванов Иван",
            phone="+7 928 000-00-00",
            registration_region="Чеченская Республика",
            service_cost=Decimal("13000.00"),
            fake_income_documents=False,
            is_married=True,
            property_debtor="Квартира, автомобиль",
            property_spouse="Нет",
            has_weapon=False,
        )
        item = create_questionnaire(db, user, payload)
        assert item.client_id is None
        assert item.organization_id == user.organization_id
        assert item.full_name == "Иванов Иван"
        assert item.property_debtor == "Квартира, автомобиль"
        assert item.property_spouse == "Нет"
        assert item.has_weapon is False
        stored = db.get(ClientQuestionnaire, item.id)
        assert stored is not None
        response = to_questionnaire_response(stored)
        assert response.created_by_name == "Менеджер Тестов"
        assert response.property_debtor == "Квартира, автомобиль"
        assert response.has_weapon is False

    def test_married_clears_divorce_and_keeps_spouse_property(self, db):
        user = _org_user(db)
        item = create_questionnaire(
            db,
            user,
            QuestionnaireCreate(
                full_name="Иванов Иван",
                phone="+7 928 000-00-00",
                is_married=True,
                divorce_info="2020",
                property_spouse="Дом",
                income_spouse="40000",
            ),
        )
        assert item.divorce_info is None
        assert item.property_spouse == "Дом"
        assert item.income_spouse == "40000"

    def test_not_married_clears_spouse_fields(self, db):
        user = _org_user(db)
        item = create_questionnaire(
            db,
            user,
            QuestionnaireCreate(
                full_name="Иванов Иван",
                phone="+7 928 000-00-00",
                is_married=False,
                divorce_info="Нет",
                property_spouse="Дом",
                income_spouse="40000",
            ),
        )
        assert item.divorce_info == "Нет"
        assert item.property_spouse is None
        assert item.income_spouse is None

    def test_divorced_keeps_spouse_property(self, db):
        user = _org_user(db)
        item = create_questionnaire(
            db,
            user,
            QuestionnaireCreate(
                full_name="Иванов Иван",
                phone="+7 928 000-00-00",
                is_married=False,
                divorce_info="2021",
                property_spouse="Дом бывшей супруги",
                income_spouse="40000",
            ),
        )
        assert item.divorce_info == "2021"
        assert item.property_spouse == "Дом бывшей супруги"
        assert item.income_spouse is None

    def test_children_can_be_saved_without_registered_marriage(self, db):
        user = _org_user(db)
        item = create_questionnaire(
            db,
            user,
            QuestionnaireCreate(
                full_name="Иванов Иван",
                phone="+7 928 000-00-00",
                is_married=False,
                divorce_info="Нет",
                dependents="двое детей, 5 и 8 лет",
            ),
        )
        assert item.is_married is False
        assert item.dependents == "двое детей, 5 и 8 лет"
        assert item.income_spouse is None
        assert item.property_spouse is None

    def test_existing_clients_table_still_has_no_questionnaire_columns(self, db):
        columns = {column.name for column in Base.metadata.tables["clients"].c}
        assert "questionnaire" not in "".join(columns)
        assert "client_questionnaires" in Base.metadata.tables
        questionnaire_columns = Base.metadata.tables["client_questionnaires"].c
        assert questionnaire_columns["client_id"].nullable is True
        assert "property_debtor" in questionnaire_columns
        assert "has_weapon" in questionnaire_columns


class TestQuestionnaireVisibility:
    def test_manager_list_hides_other_manager_questionnaires(self, db):
        first = _org_user(db, email="first@test.local", full_name="Первый")
        second = _org_user(
            db,
            email="second@test.local",
            full_name="Второй",
            organization=first.organization,
        )
        mine = create_questionnaire(db, first, _minimal_payload(full_name="Мой клиент"))
        create_questionnaire(db, second, _minimal_payload(full_name="Чужой клиент"))

        ids = {item.id for item in list_questionnaires(db, first)}
        assert ids == {mine.id}

    def test_owner_list_includes_all_questionnaires(self, db):
        owner = _org_user(
            db,
            role=UserRole.OWNER,
            email="owner@test.local",
            full_name="Руководитель",
        )
        first = _org_user(
            db,
            email="first@test.local",
            full_name="Первый",
            organization=owner.organization,
        )
        second = _org_user(
            db,
            email="second@test.local",
            full_name="Второй",
            organization=owner.organization,
        )
        one = create_questionnaire(db, first, _minimal_payload(full_name="Клиент А"))
        two = create_questionnaire(db, second, _minimal_payload(full_name="Клиент Б"))

        ids = {item.id for item in list_questionnaires(db, owner)}
        assert ids == {one.id, two.id}

    def test_call_center_list_includes_all_questionnaires(self, db):
        staff = _org_user(
            db,
            role=UserRole.CALL_CENTER,
            email="collection@test.local",
            full_name="Сбор документов",
        )
        first = _org_user(
            db,
            email="first@test.local",
            full_name="Первый",
            organization=staff.organization,
        )
        second = _org_user(
            db,
            email="second@test.local",
            full_name="Второй",
            organization=staff.organization,
        )
        one = create_questionnaire(db, first, _minimal_payload(full_name="Клиент А"))
        two = create_questionnaire(db, second, _minimal_payload(full_name="Клиент Б"))

        ids = {item.id for item in list_questionnaires(db, staff)}
        assert ids == {one.id, two.id}
        loaded = get_organization_questionnaire(db, questionnaire_id=one.id, user=staff)
        assert loaded.id == one.id

    def test_manager_cannot_open_other_manager_questionnaire(self, db):
        first = _org_user(db, email="first@test.local")
        second = _org_user(
            db,
            email="second@test.local",
            organization=first.organization,
        )
        foreign = create_questionnaire(db, first, _minimal_payload())

        with pytest.raises(HTTPException) as error:
            get_organization_questionnaire(db, questionnaire_id=foreign.id, user=second)
        assert error.value.status_code == 404

    def test_manager_sees_questionnaire_of_assigned_client(self, db):
        manager = _org_user(db, email="manager@test.local")
        owner = _org_user(
            db,
            role=UserRole.OWNER,
            email="owner@test.local",
            full_name="Руководитель",
            organization=manager.organization,
        )
        client = _client(db, manager.organization_id, assigned_manager_id=manager.id)
        item = create_questionnaire(
            db,
            owner,
            _minimal_payload(client_id=client.id, full_name="Закреплённый клиент"),
        )

        ids = {row.id for row in list_questionnaires(db, manager)}
        assert item.id in ids
        loaded = get_organization_questionnaire(db, questionnaire_id=item.id, user=manager)
        assert loaded.id == item.id

    def test_manager_cannot_bind_other_manager_client(self, db):
        first = _org_user(db, email="first@test.local")
        second = _org_user(
            db,
            email="second@test.local",
            organization=first.organization,
        )
        client = _client(db, first.organization_id, assigned_manager_id=first.id)

        with pytest.raises(HTTPException) as error:
            create_questionnaire(db, second, _minimal_payload(client_id=client.id))
        assert error.value.status_code == 403


class TestQuestionnairePdf:
    def test_empty_property_prints_absent(self):
        assert display_or_absent(None) == "Отсутствует"
        assert display_or_absent("   ") == "Отсутствует"
        assert display_or_absent("Квартира") == "Квартира"

    def test_pdf_starts_with_header_and_contains_name(self, db):
        user = _org_user(db)
        item = create_questionnaire(
            db,
            user,
            QuestionnaireCreate(full_name="Петров Пётр", phone="+7 928 111-22-33"),
        )
        content = build_questionnaire_pdf(item)
        assert content.startswith(b"%PDF")
        assert len(content) > 1000
