from datetime import date
from decimal import Decimal

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.models import Base, Organization, User
from app.models.enums import CivilCaseDocumentKind, CivilCaseStage, OrganizationType, UserRole
from app.schemas.civil_case import CivilCaseCreate, CivilCaseMovementCreate, CivilCaseUpdate
from app.services.civil_cases import (
    add_document,
    add_movement,
    create_civil_case,
    delete_document,
    get_organization_civil_case,
    list_civil_cases,
    to_civil_case_response,
    update_civil_case,
)
from app.services.dashboard import get_civil_income_stats


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


def _user(
    db,
    *,
    organization: Organization | None = None,
    org_type: OrganizationType = OrganizationType.BANKRUPTCY,
    role: UserRole = UserRole.MANAGER,
    email: str = "manager@test.local",
    full_name: str = "Менеджер Тестов",
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


class TestCivilCases:
    def test_manager_creates_case_and_assigns_executor(self, db):
        manager = _user(db)
        executor = _user(
            db,
            organization=manager.organization,
            role=UserRole.EXECUTOR,
            email="executor@test.local",
            full_name="Исполнитель Делов",
        )
        case = create_civil_case(
            db,
            manager,
            CivilCaseCreate(
                full_name="Петров Пётр Петрович",
                phone="+7 928 000-00-00",
                price=Decimal("15000.00"),
                appeal_date=date(2026, 8, 28),
                subject="Взыскание долга по расписке",
                assigned_executor_id=executor.id,
            ),
        )
        assert case.full_name == "Петров Пётр Петрович"
        assert case.phone == "+7 928 000-00-00"
        assert case.price == Decimal("15000.00")
        assert case.assigned_executor_id == executor.id
        assert case.stage == CivilCaseStage.INTAKE
        response = to_civil_case_response(case)
        assert response.assigned_executor_name == "Исполнитель Делов"
        assert response.created_by_name == "Менеджер Тестов"

    def test_executor_cannot_create_case(self, db):
        executor = _user(db, role=UserRole.EXECUTOR, email="ex@test.local")
        with pytest.raises(HTTPException) as exc:
            create_civil_case(
                db,
                executor,
                CivilCaseCreate(
                    full_name="Петров Пётр Петрович",
                    phone="+7 928 000-00-00",
                    price=Decimal("15000.00"),
                    appeal_date=date(2026, 8, 28),
                    subject="Жалоба в администрацию",
                ),
            )
        assert exc.value.status_code == 403

    def test_executor_sees_only_assigned_cases(self, db):
        manager = _user(db)
        executor = _user(
            db,
            organization=manager.organization,
            role=UserRole.EXECUTOR,
            email="executor@test.local",
            full_name="Исполнитель Делов",
        )
        other = _user(
            db,
            organization=manager.organization,
            role=UserRole.EXECUTOR,
            email="other@test.local",
            full_name="Другой Исполнитель",
        )
        assigned = create_civil_case(
            db,
            manager,
            CivilCaseCreate(
                full_name="Сидоров Сидор",
                phone="+7 928 111-22-33",
                price=Decimal("25000.00"),
                appeal_date=date(2026, 8, 1),
                subject="Иск о разделе имущества",
                assigned_executor_id=executor.id,
            ),
        )
        create_civil_case(
            db,
            manager,
            CivilCaseCreate(
                full_name="Козлов Иван",
                phone="+7 928 222-33-44",
                price=Decimal("8000.00"),
                appeal_date=date(2026, 8, 2),
                subject="Жалоба в прокуратуру",
                assigned_executor_id=other.id,
            ),
        )
        visible = list_civil_cases(db, executor)
        assert [item.id for item in visible] == [assigned.id]

    def test_executor_cannot_open_foreign_case(self, db):
        manager = _user(db)
        executor = _user(
            db,
            organization=manager.organization,
            role=UserRole.EXECUTOR,
            email="executor@test.local",
        )
        case = create_civil_case(
            db,
            manager,
            CivilCaseCreate(
                full_name="Сидоров Сидор",
                phone="+7 928 111-22-33",
                price=Decimal("25000.00"),
                appeal_date=date(2026, 8, 1),
                subject="Иск о разделе имущества",
            ),
        )
        with pytest.raises(HTTPException) as exc:
            get_organization_civil_case(db, case_id=case.id, user=executor)
        assert exc.value.status_code == 403

    def test_executor_leads_stages_and_movement(self, db):
        manager = _user(db)
        executor = _user(
            db,
            organization=manager.organization,
            role=UserRole.EXECUTOR,
            email="executor@test.local",
        )
        case = create_civil_case(
            db,
            manager,
            CivilCaseCreate(
                full_name="Сидоров Сидор",
                phone="+7 928 111-22-33",
                price=Decimal("25000.00"),
                appeal_date=date(2026, 8, 1),
                subject="Иск о разделе имущества",
                assigned_executor_id=executor.id,
            ),
        )
        updated = update_civil_case(
            db,
            executor,
            case.id,
            CivilCaseUpdate(
                documents_prepared_at=date(2026, 8, 10),
                documents_note="Иск и приложения готовы",
            ),
        )
        assert updated.stage == CivilCaseStage.DOCUMENTS
        updated = update_civil_case(
            db,
            executor,
            case.id,
            CivilCaseUpdate(submitted_at=date(2026, 8, 12), authority_name="Районный суд"),
        )
        assert updated.stage == CivilCaseStage.SUBMITTED
        updated = update_civil_case(
            db,
            executor,
            case.id,
            CivilCaseUpdate(executed_at=date(2026, 8, 20), execution_note="Решение получено"),
        )
        assert updated.stage == CivilCaseStage.COMPLETED
        updated = add_movement(
            db,
            executor,
            case.id,
            CivilCaseMovementCreate(body="Суд принял иск к производству"),
        )
        assert updated.movements[0].body == "Суд принял иск к производству"

    def test_executor_cannot_change_intake_fields(self, db):
        manager = _user(db)
        executor = _user(
            db,
            organization=manager.organization,
            role=UserRole.EXECUTOR,
            email="executor@test.local",
        )
        case = create_civil_case(
            db,
            manager,
            CivilCaseCreate(
                full_name="Сидоров Сидор",
                phone="+7 928 111-22-33",
                price=Decimal("25000.00"),
                appeal_date=date(2026, 8, 1),
                subject="Иск о разделе имущества",
                assigned_executor_id=executor.id,
            ),
        )
        with pytest.raises(HTTPException) as exc:
            update_civil_case(
                db,
                executor,
                case.id,
                CivilCaseUpdate(full_name="Другое Имя Тестов"),
            )
        assert exc.value.status_code == 403

    def test_retail_org_cannot_use_civil_cases(self, db):
        manager = _user(db, org_type=OrganizationType.RETAIL)
        with pytest.raises(HTTPException) as exc:
            create_civil_case(
                db,
                manager,
                CivilCaseCreate(
                    full_name="Петров Пётр Петрович",
                    phone="+7 928 000-00-00",
                    price=Decimal("15000.00"),
                    appeal_date=date(2026, 8, 28),
                    subject="Не должно пройти",
                ),
            )
        assert exc.value.status_code == 403

    def test_civil_income_stats_by_appeal_date(self, db):
        manager = _user(db)
        create_civil_case(
            db,
            manager,
            CivilCaseCreate(
                full_name="Петров Пётр Петрович",
                phone="+7 928 000-00-00",
                price=Decimal("10000.00"),
                appeal_date=date(2026, 8, 5),
                subject="Жалоба в администрацию",
            ),
        )
        create_civil_case(
            db,
            manager,
            CivilCaseCreate(
                full_name="Сидоров Сидор",
                phone="+7 928 111-22-33",
                price=Decimal("5000.00"),
                appeal_date=date(2026, 7, 20),
                subject="Иск о разделе имущества",
            ),
        )
        stats = get_civil_income_stats(
            db,
            manager.organization_id,
            month_start=date(2026, 8, 1),
            month_end=date(2026, 8, 31),
        )
        assert stats.cases_total == 2
        assert stats.cases_this_month == 1
        assert stats.income_total == Decimal("15000.00")
        assert stats.income_this_month == Decimal("10000.00")

    def test_manager_uploads_client_docs_executor_uploads_prepared(self, db, monkeypatch):
        monkeypatch.setattr("app.services.civil_cases.save_bytes", lambda *_args, **_kwargs: None)
        monkeypatch.setattr("app.services.civil_cases.delete_storage_key", lambda *_args, **_kwargs: None)
        manager = _user(db)
        executor = _user(
            db,
            organization=manager.organization,
            role=UserRole.EXECUTOR,
            email="executor@test.local",
        )
        case = create_civil_case(
            db,
            manager,
            CivilCaseCreate(
                full_name="Сидоров Сидор",
                phone="+7 928 111-22-33",
                price=Decimal("25000.00"),
                appeal_date=date(2026, 8, 1),
                subject="Иск о разделе имущества",
                assigned_executor_id=executor.id,
            ),
        )
        client_case = add_document(
            db,
            manager,
            case.id,
            kind=CivilCaseDocumentKind.CLIENT,
            content=b"client",
            filename="passport.pdf",
            content_type="application/pdf",
        )
        client_file = to_civil_case_response(client_case)
        assert client_file.client_documents_count == 1
        assert client_file.prepared_documents_count == 0
        with pytest.raises(HTTPException) as exc:
            add_document(
                db,
                manager,
                case.id,
                kind=CivilCaseDocumentKind.PREPARED,
                content=b"prepared",
                filename="claim.pdf",
                content_type="application/pdf",
            )
        assert exc.value.status_code == 403
        with pytest.raises(HTTPException) as forbidden_client:
            add_document(
                db,
                executor,
                case.id,
                kind=CivilCaseDocumentKind.CLIENT,
                content=b"client",
                filename="extra.pdf",
                content_type="application/pdf",
            )
        assert forbidden_client.value.status_code == 403
        prepared_case = add_document(
            db,
            executor,
            case.id,
            kind=CivilCaseDocumentKind.PREPARED,
            content=b"prepared",
            filename="claim.pdf",
            content_type="application/pdf",
        )
        prepared = to_civil_case_response(prepared_case)
        assert prepared.prepared_documents_count == 1
        assert prepared.client_documents_count == 1
        client_doc_id = next(item.id for item in prepared.documents if item.kind == CivilCaseDocumentKind.CLIENT)
        with pytest.raises(HTTPException) as forbidden_delete:
            delete_document(db, executor, case.id, client_doc_id)
        assert forbidden_delete.value.status_code == 403
        prepared_doc_id = next(
            item.id for item in prepared.documents if item.kind == CivilCaseDocumentKind.PREPARED
        )
        remaining = to_civil_case_response(delete_document(db, executor, case.id, prepared_doc_id))
        assert remaining.prepared_documents_count == 0
        assert remaining.client_documents_count == 1
