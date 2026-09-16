from datetime import date
from decimal import Decimal

import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.time import local_today
from app.models import Base, Client, ClientQuestionnaire, Organization, User
from app.models.enums import (
    EngagementStage,
    LeadCallOutcome,
    LeadStatus,
    OrganizationType,
    UserRole,
)
from app.schemas.questionnaire import (
    QuestionnaireAppointmentRequest,
    QuestionnaireAssignRequest,
    QuestionnaireCallCreate,
    QuestionnaireCreate,
    QuestionnaireCreateClientRequest,
    QuestionnaireUnqualifyRequest,
)
from app.services.questionnaire_defaults import empty_debts
from app.services.questionnaire_pdf import build_questionnaire_pdf, display_or_absent
from app.services.questionnaires import (
    assign_questionnaire,
    create_client_from_questionnaire,
    create_questionnaire,
    daily_lead_stats,
    get_organization_questionnaire,
    list_questionnaires,
    log_questionnaire_call,
    mark_questionnaire_unqualified,
    reopen_questionnaire,
    set_questionnaire_appointment,
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


class TestLeadPipeline:
    def test_lead_saves_with_phone_only(self, db):
        user = _org_user(db)
        item = create_questionnaire(db, user, QuestionnaireCreate(phone="+7 928 000-00-00"))
        assert item.full_name == ""
        assert item.lead_status == LeadStatus.NEW
        assert item.assigned_manager_id == user.id
        assert item.call_attempts == 0

    def test_lead_without_phone_is_rejected(self):
        with pytest.raises(ValidationError):
            QuestionnaireCreate(full_name="Иванов Иван", phone="   ")

    def test_no_answer_queues_lead_for_a_later_call(self, db):
        user = _org_user(db)
        item = create_questionnaire(db, user, _minimal_payload())
        item = log_questionnaire_call(
            db,
            user,
            item.id,
            QuestionnaireCallCreate(
                outcome=LeadCallOutcome.NO_ANSWER,
                next_call_at=date(2026, 9, 20),
                comment="Сбросил",
            ),
        )
        assert item.lead_status == LeadStatus.NO_ANSWER
        assert item.next_call_at == date(2026, 9, 20)
        assert item.call_attempts == 1
        assert item.last_call_at is not None

        due = list_questionnaires(db, user, due_only=True)
        assert [row.id for row in due] == []

        item = log_questionnaire_call(
            db, user, item.id, QuestionnaireCallCreate(outcome=LeadCallOutcome.NO_ANSWER)
        )
        assert item.next_call_at == local_today()
        assert item.call_attempts == 2
        assert [row.id for row in list_questionnaires(db, user, due_only=True)] == [item.id]

    def test_appointment_on_create_and_due_filter(self, db):
        user = _org_user(db)
        visit = local_today()
        item = create_questionnaire(
            db,
            user,
            _minimal_payload(
                appointment_at=visit,
                appointment_note="Подойдёт после обеда",
            ),
        )
        assert item.appointment_at == visit
        assert item.appointment_note == "Подойдёт после обеда"
        assert item.lead_status == LeadStatus.IN_PROGRESS
        assert [row.id for row in list_questionnaires(db, user, appointment_due=True)] == [item.id]

        item = set_questionnaire_appointment(
            db,
            user,
            item.id,
            QuestionnaireAppointmentRequest(appointment_at=date(2099, 1, 15), appointment_note=None),
        )
        assert item.appointment_at == date(2099, 1, 15)
        assert item.lead_status == LeadStatus.IN_PROGRESS
        assert list_questionnaires(db, user, appointment_due=True) == []

        item = set_questionnaire_appointment(
            db,
            user,
            item.id,
            QuestionnaireAppointmentRequest(appointment_at=None, appointment_note=None),
        )
        assert item.appointment_at is None
        response = to_questionnaire_response(item)
        assert response.appointment_at is None

    def test_answered_call_returns_lead_to_work(self, db):
        user = _org_user(db)
        item = create_questionnaire(db, user, _minimal_payload())
        log_questionnaire_call(
            db, user, item.id, QuestionnaireCallCreate(outcome=LeadCallOutcome.NO_ANSWER)
        )
        item = log_questionnaire_call(
            db,
            user,
            item.id,
            QuestionnaireCallCreate(outcome=LeadCallOutcome.ANSWERED, comment="Согласен встретиться"),
        )
        assert item.lead_status == LeadStatus.IN_PROGRESS
        assert item.next_call_at is None

        response = to_questionnaire_response(item)
        assert [call.outcome for call in response.calls] == [
            LeadCallOutcome.ANSWERED,
            LeadCallOutcome.NO_ANSWER,
        ]
        assert response.calls[0].comment == "Согласен встретиться"
        assert response.calls[0].created_by_name == "Менеджер Тестов"

    def test_unqualified_lead_keeps_its_reason_until_reopened(self, db):
        user = _org_user(db)
        item = create_questionnaire(db, user, _minimal_payload())
        item = mark_questionnaire_unqualified(
            db,
            user,
            item.id,
            QuestionnaireUnqualifyRequest(reason="Долг 90 тысяч, банкротство не окупится"),
        )
        assert item.lead_status == LeadStatus.UNQUALIFIED
        assert item.unqualified_reason == "Долг 90 тысяч, банкротство не окупится"
        assert item.unqualified_by_id == user.id
        assert item.next_call_at is None

        item = reopen_questionnaire(db, user, item.id)
        assert item.lead_status == LeadStatus.NEW
        assert item.unqualified_reason is None

    def test_unqualify_reason_cannot_be_blank(self):
        with pytest.raises(ValidationError):
            QuestionnaireUnqualifyRequest(reason="   ")

    def test_converted_lead_cannot_be_marked_unqualified(self, db):
        user = _org_user(db)
        item = create_questionnaire(
            db, user, _minimal_payload(full_name="Иванов Иван Иванович")
        )
        item, _client = create_client_from_questionnaire(
            db, user, item.id, QuestionnaireCreateClientRequest()
        )
        assert item.lead_status == LeadStatus.CONVERTED
        assert item.converted_by_id == user.id

        with pytest.raises(HTTPException) as error:
            mark_questionnaire_unqualified(
                db, user, item.id, QuestionnaireUnqualifyRequest(reason="Передумал")
            )
        assert error.value.status_code == 409

    def test_head_manager_sees_every_lead(self, db):
        head = _org_user(
            db,
            role=UserRole.HEAD_MANAGER,
            email="head@test.local",
            full_name="Начальник Отдела",
        )
        manager = _org_user(
            db,
            email="manager@test.local",
            full_name="Менеджер Тестов",
            organization=head.organization,
        )
        foreign = create_questionnaire(db, manager, _minimal_payload(full_name="Чужой лид"))
        assert foreign.id in {row.id for row in list_questionnaires(db, head)}
        assert get_organization_questionnaire(db, questionnaire_id=foreign.id, user=head).id == foreign.id

    def test_only_supervisors_reassign_leads(self, db):
        head = _org_user(
            db,
            role=UserRole.HEAD_MANAGER,
            email="head@test.local",
            full_name="Начальник Отдела",
        )
        first = _org_user(
            db, email="first@test.local", full_name="Первый Менеджер", organization=head.organization
        )
        second = _org_user(
            db, email="second@test.local", full_name="Второй Менеджер", organization=head.organization
        )
        item = create_questionnaire(db, first, _minimal_payload())

        with pytest.raises(HTTPException) as error:
            assign_questionnaire(db, first, item.id, QuestionnaireAssignRequest(manager_id=second.id))
        assert error.value.status_code == 403

        item = assign_questionnaire(
            db, head, item.id, QuestionnaireAssignRequest(manager_id=second.id)
        )
        assert item.assigned_manager_id == second.id
        assert item.id in {row.id for row in list_questionnaires(db, second)}

    def test_daily_stats_split_work_by_manager(self, db):
        head = _org_user(
            db,
            role=UserRole.HEAD_MANAGER,
            email="head@test.local",
            full_name="Начальник Отдела",
        )
        first = _org_user(
            db, email="first@test.local", full_name="Алиев Алий", organization=head.organization
        )
        second = _org_user(
            db, email="second@test.local", full_name="Борисов Борис", organization=head.organization
        )

        one = create_questionnaire(db, first, _minimal_payload(full_name="Иванов Иван Иванович"))
        log_questionnaire_call(
            db, first, one.id, QuestionnaireCallCreate(outcome=LeadCallOutcome.NO_ANSWER)
        )
        log_questionnaire_call(
            db, first, one.id, QuestionnaireCallCreate(outcome=LeadCallOutcome.ANSWERED)
        )
        create_client_from_questionnaire(db, first, one.id, QuestionnaireCreateClientRequest())

        two = create_questionnaire(db, second, _minimal_payload(full_name="Петров Пётр"))
        log_questionnaire_call(
            db, second, two.id, QuestionnaireCallCreate(outcome=LeadCallOutcome.ANSWERED)
        )
        mark_questionnaire_unqualified(
            db, second, two.id, QuestionnaireUnqualifyRequest(reason="Не тот регион")
        )

        stats = daily_lead_stats(db, head)
        by_name = {row.manager_name: row for row in stats.rows}
        assert by_name["Алиев Алий"].leads_added == 1
        assert by_name["Алиев Алий"].calls_total == 2
        assert by_name["Алиев Алий"].calls_answered == 1
        assert by_name["Алиев Алий"].calls_no_answer == 1
        assert by_name["Алиев Алий"].converted == 1
        assert by_name["Борисов Борис"].unqualified == 1
        assert stats.totals.calls_total == 3
        assert stats.totals.leads_added == 2

        own = daily_lead_stats(db, second)
        assert [row.manager_name for row in own.rows] == ["Борисов Борис"]
        assert own.totals.calls_total == 1

    def test_lead_counts_by_day_for_supervisors(self, db):
        from datetime import timedelta

        from app.core.time import local_today
        from app.services.questionnaires import lead_counts_by_day
        from fastapi import HTTPException

        head = _org_user(
            db,
            role=UserRole.HEAD_MANAGER,
            email="head-days@test.local",
            full_name="Начальник Отдела",
        )
        first = _org_user(
            db,
            email="first-days@test.local",
            full_name="Алиев Алий",
            organization=head.organization,
        )
        second = _org_user(
            db,
            email="second-days@test.local",
            full_name="Борисов Борис",
            organization=head.organization,
        )
        create_questionnaire(db, first, _minimal_payload(full_name="Один"))
        create_questionnaire(db, first, _minimal_payload(full_name="Два"))
        create_questionnaire(db, second, _minimal_payload(full_name="Три"))

        today = local_today()
        counts = lead_counts_by_day(db, head, date_from=today, date_to=today)
        assert counts.totals == 3
        assert counts.rows[0].day == today
        assert counts.rows[0].leads_added == 3
        by_name = {row.manager_name: row.leads_added for row in counts.rows[0].by_manager}
        assert by_name["Алиев Алий"] == 2
        assert by_name["Борисов Борис"] == 1

        filtered = lead_counts_by_day(
            db, head, date_from=today, date_to=today, manager_id=first.id
        )
        assert filtered.totals == 2

        with pytest.raises(HTTPException) as forbidden:
            lead_counts_by_day(db, first, date_from=today, date_to=today)
        assert forbidden.value.status_code == 403

        with pytest.raises(HTTPException) as too_long:
            lead_counts_by_day(
                db,
                head,
                date_from=today - timedelta(days=100),
                date_to=today,
            )
        assert too_long.value.status_code == 422

    def test_list_filters_by_created_on(self, db):
        from datetime import timedelta

        from app.core.time import local_today

        head = _org_user(
            db,
            role=UserRole.HEAD_MANAGER,
            email="head-created-on@test.local",
            full_name="Начальник",
        )
        manager = _org_user(
            db,
            email="mgr-created-on@test.local",
            full_name="Менеджер",
            organization=head.organization,
        )
        today_item = create_questionnaire(db, manager, _minimal_payload(full_name="Сегодняшний"))
        today = local_today()
        rows = list_questionnaires(db, head, created_on=today)
        assert {item.id for item in rows} == {today_item.id}
        rows_by_author = list_questionnaires(
            db, head, created_on=today, created_by_id=manager.id
        )
        assert {item.id for item in rows_by_author} == {today_item.id}
        empty = list_questionnaires(db, head, created_on=today - timedelta(days=40))
        assert empty == []


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
