import uuid
from datetime import date, timedelta
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import MagicMock

from app.models.enums import PaymentScheduleStatus, ProcedureStage, TaskStatus, UserRole
from app.services.funnel import get_funnel_overview, sync_overdue_tasks


ORG_ID = uuid.UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
USER_ID = uuid.UUID("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb")
CLIENT_ID = uuid.UUID("cccccccc-cccc-cccc-cccc-cccccccccccc")
PLAN_ID = uuid.UUID("dddddddd-dddd-dddd-dddd-dddddddddddd")
SCHEDULE_ID = uuid.UUID("eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee")


def make_user(role: UserRole = UserRole.OWNER) -> SimpleNamespace:
    return SimpleNamespace(id=USER_ID, organization_id=ORG_ID, role=role)


def make_client(stage: ProcedureStage = ProcedureStage.DEPOSIT) -> SimpleNamespace:
    return SimpleNamespace(
        id=CLIENT_ID,
        organization_id=ORG_ID,
        assigned_manager_id=USER_ID,
        full_name="Иванов Иван",
        phone="+7 928 000-00-00",
        procedure_stage=stage,
        is_deleted=False,
    )


class TestFunnelOverview:
    def test_counts_clients_by_stage(self):
        clients = [
            make_client(ProcedureStage.CONTRACT_SIGNED),
            make_client(ProcedureStage.DEPOSIT),
            make_client(ProcedureStage.DEPOSIT),
        ]
        db = MagicMock()
        db.scalars.return_value = clients

        overview = get_funnel_overview(db, make_user())

        assert overview.total_clients == 3
        deposit = next(item for item in overview.stages if item.stage == ProcedureStage.DEPOSIT)
        assert deposit.count == 2


class TestOverdueTaskSync:
    def test_creates_auto_task_for_overdue_schedule(self):
        client = make_client()
        plan = SimpleNamespace(id=PLAN_ID, client_id=CLIENT_ID)
        schedule = SimpleNamespace(
            id=SCHEDULE_ID,
            installment_plan_id=PLAN_ID,
            planned_amount=Decimal("10000.00"),
            paid_amount=Decimal("0.00"),
            due_date=date(2020, 1, 1),
            deferred_until=None,
            status=PaymentScheduleStatus.OVERDUE,
        )

        db = MagicMock()
        db.scalars.side_effect = [
            [client],
            [plan],
            [schedule],
            [],
            [],
        ]

        sync_overdue_tasks(db, make_user())

        db.add.assert_called_once()
        db.commit.assert_called_once()
        created = db.add.call_args.args[0]
        assert created.client_id == CLIENT_ID
        assert created.task_type.value == "overdue_payment"
        assert created.status == TaskStatus.OPEN

    def test_does_not_recreate_task_after_done_at_same_escalation(self):
        today = date.today()
        window_end = today - timedelta(days=5)
        due_date = date(window_end.year, window_end.month, 10)

        client = make_client()
        plan = SimpleNamespace(id=PLAN_ID, client_id=CLIENT_ID)
        schedule = SimpleNamespace(
            id=SCHEDULE_ID,
            installment_plan_id=PLAN_ID,
            planned_amount=Decimal("10000.00"),
            paid_amount=Decimal("0.00"),
            due_date=due_date,
            deferred_until=None,
            status=PaymentScheduleStatus.OVERDUE,
        )
        handled_task = SimpleNamespace(
            payment_schedule_id=SCHEDULE_ID,
            status=TaskStatus.DONE,
            overdue_days=5,
            completed_at=today,
            updated_at=today,
        )

        db = MagicMock()
        db.scalars.side_effect = [
            [client],
            [plan],
            [schedule],
            [],
            [handled_task],
        ]

        sync_overdue_tasks(db, make_user())

        db.add.assert_not_called()
