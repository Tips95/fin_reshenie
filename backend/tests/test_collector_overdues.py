"""Роль коллектора, collection API и уведомления по promised_pay_date."""

import uuid
from datetime import date, timedelta
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.deps import require_overdue_staff, require_owner_or_manager
from app.core.config import settings
from app.core.database import get_db
from app.main import app
from app.models import Base, Client, InstallmentPlan, Notification, Organization, PaymentSchedule, User
from app.models.enums import (
    ClientStatus,
    CollectionCallResult,
    EngagementStage,
    OrganizationType,
    PaymentScheduleStatus,
    ProcedureStage,
    UserRole,
)
from app.services.access import ensure_client_write_access
from app.services.overdues import record_collection, sync_promised_pay_notifications
from app.schemas.overdue import CollectionUpdate

API = settings.API_PREFIX


@pytest.fixture()
def session_factory():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

    def override_get_db():
        db = factory()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    try:
        yield factory
    finally:
        app.dependency_overrides.pop(get_db, None)
        engine.dispose()


@pytest.fixture()
def api(session_factory):
    return TestClient(app)


def _auth(api: TestClient, login: str, password: str) -> dict[str, str]:
    response = api.post(f"{API}/auth/login", json={"login": login, "password": password})
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


@pytest.fixture()
def office(api, session_factory):
    response = api.post(
        f"{API}/auth/register",
        json={"organization_name": "Решение", "login": "owner@co.ru", "password": "secret123"},
    )
    assert response.status_code == 201, response.text
    owner = {"Authorization": f"Bearer {response.json()['access_token']}"}

    collector = api.post(
        f"{API}/users",
        headers=owner,
        json={
            "full_name": "Коллекторов Иван",
            "email": "collector@co.ru",
            "password": "secret123",
            "role": "collector",
        },
    )
    assert collector.status_code == 201, collector.text

    # Просроченный клиент с графиком.
    db = session_factory()
    try:
        org = db.scalar(select(Organization))
        assert org is not None
        client = Client(
            id=uuid.uuid4(),
            organization_id=org.id,
            full_name="Должников Пётр",
            phone="+79001112233",
            contract_date=date.today() - timedelta(days=120),
            debt_amount=Decimal("400000.00"),
            status=ClientStatus.ACTIVE,
            engagement_stage=EngagementStage.BANKRUPTCY,
            procedure_stage=ProcedureStage.CONTRACT_SIGNED,
        )
        db.add(client)
        db.flush()
        plan = InstallmentPlan(
            id=uuid.uuid4(),
            client_id=client.id,
            pricing_tier_id=None,
            total_amount=Decimal("20000.00"),
            start_date=client.contract_date,
            total_months=2,
        )
        db.add(plan)
        db.flush()
        due = date.today() - timedelta(days=45)
        schedule = PaymentSchedule(
            id=uuid.uuid4(),
            installment_plan_id=plan.id,
            month_number=1,
            due_date=due,
            planned_amount=Decimal("10000.00"),
            paid_amount=Decimal("0.00"),
            status=PaymentScheduleStatus.OVERDUE,
        )
        due_this_month = date.today().replace(day=min(date.today().day, 28))
        current_month = PaymentSchedule(
            id=uuid.uuid4(),
            installment_plan_id=plan.id,
            month_number=2,
            due_date=due_this_month,
            planned_amount=Decimal("8000.00"),
            paid_amount=Decimal("0.00"),
            status=PaymentScheduleStatus.PENDING,
        )
        db.add_all([schedule, current_month])
        db.commit()
        client_id = str(client.id)
        schedule_id = str(schedule.id)
    finally:
        db.close()

    return {
        "owner": owner,
        "collector": _auth(api, "collector@co.ru", "secret123"),
        "client_id": client_id,
        "schedule_id": schedule_id,
    }


class TestCollectorRoleAccess:
    def test_team_accepts_collector_role(self, api, office):
        users = api.get(f"{API}/users", headers=office["owner"])
        assert users.status_code == 200
        roles = {item["email"]: item["role"] for item in users.json()}
        assert roles.get("collector@co.ru") == "collector"

    def test_overdue_staff_dependency_includes_collector(self):
        closure = {
            name: cell.cell_contents
            for name, cell in zip(
                require_overdue_staff.__code__.co_freevars,
                require_overdue_staff.__closure__ or (),
            )
        }
        assert UserRole.COLLECTOR in closure["allowed_roles"]
        assert UserRole.COLLECTOR not in {
            name: cell.cell_contents
            for name, cell in zip(
                require_owner_or_manager.__code__.co_freevars,
                require_owner_or_manager.__closure__ or (),
            )
        }["allowed_roles"]

    def test_collector_forbidden_on_payments(self, api, office):
        response = api.post(
            f"{API}/payments",
            headers=office["collector"],
            json={
                "client_id": office["client_id"],
                "amount": "1000.00",
                "payment_date": date.today().isoformat(),
            },
        )
        assert response.status_code == 403

    def test_collector_forbidden_schedule_edit(self, api, office):
        response = api.patch(
            f"{API}/payment-schedule/{office['schedule_id']}",
            headers=office["collector"],
            json={"planned_amount": "9000.00"},
        )
        assert response.status_code == 403

    def test_collector_write_access_blocked(self, session_factory, office):
        db = session_factory()
        try:
            collector = db.scalar(select(User).where(User.email == "collector@co.ru"))
            assert collector is not None
            with pytest.raises(Exception) as exc:
                ensure_client_write_access(db, collector, uuid.UUID(office["client_id"]))
            assert exc.value.status_code == 403
        finally:
            db.close()


class TestCollectionApi:
    def test_collector_lists_overdues(self, api, office):
        response = api.get(f"{API}/overdues", headers=office["collector"])
        assert response.status_code == 200, response.text
        payload = response.json()
        assert payload["total"] >= 1
        item = next(row for row in payload["items"] if row["client_id"] == office["client_id"])
        assert Decimal(item["overdue_amount"]) == Decimal("10000.00")
        assert item["overdue_days"] >= 1

    def test_collector_posts_collection(self, api, office):
        response = api.post(
            f"{API}/payment-schedule/{office['schedule_id']}/collection",
            headers=office["collector"],
            json={
                "manager_note": "обещал завтра",
                "call_result": "promised",
                "promised_pay_date": date.today().isoformat(),
            },
        )
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["manager_note"] == "обещал завтра"
        assert body["last_call_result"] == "promised"
        assert body["promised_pay_date"] == date.today().isoformat()
        assert len(body["collection_events"]) >= 1

    def test_list_overdues_after_call_with_sqlite_naive_datetime(self, api, office):
        """После звонка SQLite отдаёт naive last_call_at — очередь не должна падать."""
        posted = api.post(
            f"{API}/payment-schedule/{office['schedule_id']}/collection",
            headers=office["collector"],
            json={"call_result": "no_answer", "manager_note": "не берёт"},
        )
        assert posted.status_code == 200, posted.text

        response = api.get(f"{API}/overdues", headers=office["collector"])
        assert response.status_code == 200, response.text
        item = next(
            row for row in response.json()["items"] if row["client_id"] == office["client_id"]
        )
        assert item["last_call_result"] == "no_answer"
        assert item["manager_note"] == "не берёт"


class TestPromisedPayNotifications:
    def test_sync_creates_once_and_resets_on_date_change(self, session_factory, office):
        db = session_factory()
        try:
            schedule = db.get(PaymentSchedule, uuid.UUID(office["schedule_id"]))
            collector = db.scalar(select(User).where(User.email == "collector@co.ru"))
            assert schedule is not None and collector is not None

            record_collection(
                db,
                collector,
                schedule.id,
                CollectionUpdate(
                    call_result=CollectionCallResult.PROMISED,
                    promised_pay_date=date.today(),
                ),
            )

            created = sync_promised_pay_notifications(
                db, organization_id=collector.organization_id, today=date.today()
            )
            assert created == 1
            notes = db.scalars(
                select(Notification).where(Notification.kind == "promised_pay")
            ).all()
            assert len(notes) >= 1

            created_again = sync_promised_pay_notifications(
                db, organization_id=collector.organization_id, today=date.today()
            )
            assert created_again == 0

            schedule = db.get(PaymentSchedule, schedule.id)
            assert schedule is not None
            assert schedule.promised_notified_at is not None

            record_collection(
                db,
                collector,
                schedule.id,
                CollectionUpdate(promised_pay_date=date.today() + timedelta(days=3)),
            )
            schedule = db.get(PaymentSchedule, schedule.id)
            assert schedule is not None
            assert schedule.promised_notified_at is None

            # Новый день обещания ещё не наступил — уведомления нет.
            assert (
                sync_promised_pay_notifications(
                    db,
                    organization_id=collector.organization_id,
                    today=date.today(),
                )
                == 0
            )

            # В день новой даты снова шлём.
            created_new = sync_promised_pay_notifications(
                db,
                organization_id=collector.organization_id,
                today=date.today() + timedelta(days=3),
            )
            assert created_new == 1
        finally:
            db.close()


class TestDashboardOverduePreviewFields:
    def test_preview_includes_overdue_fields(self, api, office):
        response = api.get(f"{API}/dashboard/summary", headers=office["owner"])
        assert response.status_code == 200, response.text
        preview = response.json().get("overdue_clients_preview") or []
        match = next((item for item in preview if item["id"] == office["client_id"]), None)
        assert match is not None
        assert match.get("overdue_amount") is not None
        assert match.get("overdue_days") is not None


class TestCollectorDashboard:
    def test_collector_dashboard_returns_kpis(self, api, office):
        response = api.get(f"{API}/dashboard/collector", headers=office["collector"])
        assert response.status_code == 200, response.text
        body = response.json()
        assert Decimal(body["overdue_amount"]) >= Decimal("10000.00")
        assert body["clients_overdue"] >= 1
        assert Decimal(body["expected_this_month"]) >= Decimal("8000.00")
        assert any(item["client_id"] == office["client_id"] for item in body["overdue_preview"])
        assert any(item["client_id"] == office["client_id"] for item in body["due_this_month_preview"])

    def test_overdue_amount_matches_queue_and_owner_dashboard(self, api, office):
        """Дашборд коллектора, очередь и KPI владельца — одна сумма просрочки."""
        queue = api.get(f"{API}/overdues", headers=office["collector"])
        assert queue.status_code == 200, queue.text
        queue_body = queue.json()

        collector = api.get(f"{API}/dashboard/collector", headers=office["collector"])
        assert collector.status_code == 200, collector.text
        collector_body = collector.json()

        owner = api.get(f"{API}/dashboard/summary", headers=office["owner"])
        assert owner.status_code == 200, owner.text
        owner_body = owner.json()

        queue_total = Decimal(queue_body["total_overdue_amount"])
        items_sum = sum(
            (Decimal(item["overdue_amount"]) for item in queue_body["items"]),
            Decimal("0.00"),
        )
        assert queue_total == items_sum
        assert Decimal(collector_body["overdue_amount"]) == queue_total
        assert collector_body["clients_overdue"] == queue_body["total"]
        assert Decimal(owner_body["overdue_amount"]) == queue_total
        assert owner_body["clients_overdue"] == queue_body["total"]

    def test_call_center_forbidden_on_collector_dashboard(self, api, office):
        created = api.post(
            f"{API}/users",
            headers=office["owner"],
            json={
                "full_name": "Сбор Документов",
                "email": "docs@co.ru",
                "password": "secret123",
                "role": "call_center",
            },
        )
        assert created.status_code == 201, created.text
        headers = _auth(api, "docs@co.ru", "secret123")
        response = api.get(f"{API}/dashboard/collector", headers=headers)
        assert response.status_code == 403
