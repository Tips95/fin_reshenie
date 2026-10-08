from datetime import date
from decimal import Decimal
from time import monotonic
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.client import Client
from app.models.enums import (
    ClientStatus,
    EngagementStage,
    ProcedureStage,
    TaskSource,
    TaskStatus,
    TaskType,
    UserRole,
)
from app.models.installment_plan import InstallmentPlan
from app.models.manager_task import ManagerTask
from app.models.payment_schedule import PaymentSchedule
from app.models.user import User
from app.schemas.funnel import FunnelOverview, FunnelStageItem, ManagerTaskResponse
from app.services.access import apply_client_visibility_filter, ensure_client_read_access
from app.services.schedule_dates import (
    effective_due_date,
    is_schedule_overdue,
    payment_window_end,
    schedule_overdue_days,
    schedule_remainder,
)

# Soft throttle: sync writes on task list reads at most once per org per minute
# (per worker). Count endpoint never syncs.
_TASK_SYNC_INTERVAL_SEC = 60.0
_last_task_sync_at: dict[UUID, float] = {}

PROCEDURE_STAGE_ORDER = [
    ProcedureStage.CONTRACT_SIGNED,
    ProcedureStage.DEPOSIT,
    ProcedureStage.FINANCIAL_MANAGEMENT,
    ProcedureStage.COURT,
    ProcedureStage.COMPLETED,
]

OVERDUE_ESCALATION_THRESHOLDS = (1, 4, 8, 15)


def get_funnel_overview(db: Session, user: User) -> FunnelOverview:
    stmt = (
        select(Client.procedure_stage, func.count())
        .where(
            Client.is_deleted.is_(False),
            Client.engagement_stage == EngagementStage.BANKRUPTCY,
        )
        .group_by(Client.procedure_stage)
    )
    stmt = apply_client_visibility_filter(stmt, user)
    counts = {stage: count for stage, count in db.execute(stmt)}
    total = sum(counts.values())

    stages = [
        FunnelStageItem(stage=stage, count=counts.get(stage, 0)) for stage in PROCEDURE_STAGE_ORDER
    ]
    return FunnelOverview(stages=stages, total_clients=total)


def _overdue_escalation_tier(days: int) -> int:
    if days >= 15:
        return 3
    if days >= 8:
        return 2
    if days >= 4:
        return 1
    return 0


def _build_task_title(client_name: str, overdue_days: int, schedule_due: date) -> str:
    window_end = payment_window_end(schedule_due)
    month_label = schedule_due.strftime("%m.%Y")
    return (
        f"Связаться с {client_name}: просрочка {overdue_days} дн. "
        f"(платёж {month_label}, окно 25–{window_end.day:02d})"
    )


def _first_payment_already_recorded(db: Session, client_id: UUID) -> bool:
    month1 = db.scalar(
        select(PaymentSchedule)
        .join(InstallmentPlan, InstallmentPlan.id == PaymentSchedule.installment_plan_id)
        .where(
            InstallmentPlan.client_id == client_id,
            PaymentSchedule.month_number == 1,
        )
    )
    return month1 is not None and month1.paid_amount > Decimal("0.00")


def ensure_first_payment_task_for_manager_client(
    db: Session,
    *,
    client: Client,
    actor: User,
) -> None:
    if actor.role != UserRole.MANAGER:
        return

    existing = db.scalar(
        select(ManagerTask).where(
            ManagerTask.client_id == client.id,
            ManagerTask.task_type == TaskType.FIRST_PAYMENT_RECORD,
            ManagerTask.status == TaskStatus.OPEN,
        )
    )
    if existing is not None:
        if client.engagement_stage == EngagementStage.BANKRUPTCY:
            existing.title = f"Зафиксировать первый платёж: {client.full_name}"
        return

    if client.engagement_stage == EngagementStage.BANKRUPTCY:
        if _first_payment_already_recorded(db, client.id):
            return
        plan = db.scalar(select(InstallmentPlan).where(InstallmentPlan.client_id == client.id).limit(1))
        if plan is None:
            return
        title = f"Зафиксировать первый платёж: {client.full_name}"
        note = f"Клиент занесён менеджером {actor.full_name}"
    elif client.engagement_stage == EngagementStage.DOCUMENT_COLLECTION:
        title = f"Новый клиент: {client.full_name} — зафиксировать первый платёж"
        note = (
            f"Менеджер {actor.full_name} добавил клиента. "
            "После перевода на банкротство откройте карточку и внесите 1-й платёж."
        )
    else:
        return

    db.add(
        ManagerTask(
            organization_id=client.organization_id,
            client_id=client.id,
            assigned_manager_id=None,
            task_type=TaskType.FIRST_PAYMENT_RECORD,
            status=TaskStatus.OPEN,
            source=TaskSource.AUTO,
            title=title,
            note=note,
            due_date=date.today(),
        )
    )


def complete_first_payment_tasks(
    db: Session,
    client_id: UUID,
    *,
    completed_by: UUID | None = None,
) -> None:
    tasks = list(
        db.scalars(
            select(ManagerTask).where(
                ManagerTask.client_id == client_id,
                ManagerTask.task_type == TaskType.FIRST_PAYMENT_RECORD,
                ManagerTask.status == TaskStatus.OPEN,
            )
        )
    )
    if not tasks:
        return

    today = date.today()
    for task in tasks:
        task.status = TaskStatus.DONE
        task.completed_at = today
        if completed_by is not None:
            task.completed_by = completed_by


def sync_first_payment_tasks(db: Session, user: User) -> None:
    if user.role == UserRole.CALL_CENTER:
        return

    open_tasks = list(
        db.scalars(
            select(ManagerTask).where(
                ManagerTask.organization_id == user.organization_id,
                ManagerTask.task_type == TaskType.FIRST_PAYMENT_RECORD,
                ManagerTask.status == TaskStatus.OPEN,
            )
        )
    )
    if not open_tasks:
        return

    client_ids = [task.client_id for task in open_tasks]
    clients = {
        client.id: client
        for client in db.scalars(select(Client).where(Client.id.in_(client_ids)))
    }
    paid_client_ids = {
        client_id
        for client_id, paid_amount in db.execute(
            select(InstallmentPlan.client_id, PaymentSchedule.paid_amount)
            .join(PaymentSchedule, PaymentSchedule.installment_plan_id == InstallmentPlan.id)
            .where(
                InstallmentPlan.client_id.in_(client_ids),
                PaymentSchedule.month_number == 1,
            )
        )
        if paid_amount is not None and paid_amount > Decimal("0.00")
    }

    today = date.today()
    for task in open_tasks:
        client = clients.get(task.client_id)
        if client is None or client.is_deleted:
            task.status = TaskStatus.DISMISSED
            task.completed_at = today
            continue
        if task.client_id in paid_client_ids:
            task.status = TaskStatus.DONE
            task.completed_at = today

    db.commit()


def count_open_manager_tasks(db: Session, user: User) -> int:
    stmt = (
        select(func.count())
        .select_from(ManagerTask)
        .join(Client, Client.id == ManagerTask.client_id)
        .where(
            ManagerTask.organization_id == user.organization_id,
            ManagerTask.status == TaskStatus.OPEN,
            Client.is_deleted.is_(False),
        )
    )
    if user.role == UserRole.MANAGER:
        stmt = stmt.where(ManagerTask.assigned_manager_id == user.id)
    return int(db.scalar(stmt) or 0)


def try_ensure_first_payment_task_for_manager_client(
    db: Session,
    *,
    client: Client,
    actor: User,
) -> None:
    try:
        ensure_first_payment_task_for_manager_client(db, client=client, actor=actor)
        db.commit()
    except Exception:
        db.rollback()


def sync_overdue_tasks(db: Session, user: User) -> None:
    if user.role == UserRole.CALL_CENTER:
        return

    today = date.today()
    stmt = select(Client).where(Client.is_deleted.is_(False))
    stmt = apply_client_visibility_filter(stmt, user)
    clients = list(db.scalars(stmt))
    client_map = {client.id: client for client in clients}
    client_ids = list(client_map.keys())
    if not client_ids:
        return

    plans = list(
        db.scalars(select(InstallmentPlan).where(InstallmentPlan.client_id.in_(client_ids)))
    )
    plan_ids = [plan.id for plan in plans]
    plan_client_map = {plan.id: plan.client_id for plan in plans}

    schedules: list[PaymentSchedule] = []
    if plan_ids:
        schedules = list(
            db.scalars(
                select(PaymentSchedule).where(PaymentSchedule.installment_plan_id.in_(plan_ids))
            )
        )

    schedule_ids = [schedule.id for schedule in schedules]

    open_auto_tasks = list(
        db.scalars(
            select(ManagerTask).where(
                ManagerTask.organization_id == user.organization_id,
                ManagerTask.source == TaskSource.AUTO,
                ManagerTask.task_type == TaskType.OVERDUE_PAYMENT,
                ManagerTask.status == TaskStatus.OPEN,
            )
        )
    )
    tasks_by_schedule = {
        task.payment_schedule_id: task
        for task in open_auto_tasks
        if task.payment_schedule_id is not None
    }

    latest_handled_tasks: dict[UUID, ManagerTask] = {}
    if schedule_ids:
        handled_tasks = list(
            db.scalars(
                select(ManagerTask).where(
                    ManagerTask.organization_id == user.organization_id,
                    ManagerTask.task_type == TaskType.OVERDUE_PAYMENT,
                    ManagerTask.payment_schedule_id.in_(schedule_ids),
                    ManagerTask.status.in_((TaskStatus.DONE, TaskStatus.DISMISSED)),
                )
            )
        )
        for task in sorted(
            handled_tasks,
            key=lambda item: (item.completed_at or date.min, item.updated_at),
            reverse=True,
        ):
            if task.payment_schedule_id and task.payment_schedule_id not in latest_handled_tasks:
                latest_handled_tasks[task.payment_schedule_id] = task

    active_schedule_ids: set[UUID] = set()
    for schedule in schedules:
        client_id = plan_client_map.get(schedule.installment_plan_id)
        client = client_map.get(client_id)
        if client is None:
            continue
        if client.status in (ClientStatus.CANCELLED, ClientStatus.COMPLETED):
            continue

        if not is_schedule_overdue(schedule, today):
            continue

        overdue_days = schedule_overdue_days(schedule, today)
        active_schedule_ids.add(schedule.id)
        schedule_due = effective_due_date(schedule)
        title = _build_task_title(client.full_name, overdue_days, schedule_due)

        handled = latest_handled_tasks.get(schedule.id)
        if handled is not None:
            handled_days = handled.overdue_days or 0
            if _overdue_escalation_tier(overdue_days) <= _overdue_escalation_tier(handled_days):
                continue

        existing = tasks_by_schedule.get(schedule.id)
        if existing:
            existing.overdue_days = overdue_days
            existing.title = title
            existing.assigned_manager_id = client.assigned_manager_id
            existing.due_date = today
            continue

        db.add(
            ManagerTask(
                organization_id=user.organization_id,
                client_id=client.id,
                assigned_manager_id=client.assigned_manager_id,
                payment_schedule_id=schedule.id,
                task_type=TaskType.OVERDUE_PAYMENT,
                status=TaskStatus.OPEN,
                source=TaskSource.AUTO,
                title=title,
                overdue_days=overdue_days,
                due_date=today,
            )
        )

    for task in open_auto_tasks:
        if task.payment_schedule_id and task.payment_schedule_id not in active_schedule_ids:
            task.status = TaskStatus.DISMISSED
            task.note = "Просрочка закрыта"
            task.completed_at = today

    db.commit()


def _should_sync_tasks(organization_id: UUID) -> bool:
    now = monotonic()
    last = _last_task_sync_at.get(organization_id, 0.0)
    if now - last < _TASK_SYNC_INTERVAL_SEC:
        return False
    _last_task_sync_at[organization_id] = now
    return True


def _task_to_response(
    task: ManagerTask,
    *,
    client: Client | None = None,
    manager: User | None = None,
    schedule: PaymentSchedule | None = None,
) -> ManagerTaskResponse:
    data = ManagerTaskResponse.model_validate(task)
    data.client_name = client.full_name if client else None
    data.client_phone = client.phone if client else None
    data.manager_name = manager.full_name if manager else None

    if schedule is not None:
        schedule_due = effective_due_date(schedule)
        data.schedule_due_date = schedule_due
        data.remainder_amount = schedule_remainder(schedule)
        data.payment_window_label = (
            f"25–{payment_window_end(schedule_due).day:02d} "
            f"{schedule_due.strftime('%m.%Y')}"
        )

    return data


def _load_task_response_maps(
    db: Session,
    tasks: list[ManagerTask],
) -> tuple[dict[UUID, Client], dict[UUID, User], dict[UUID, PaymentSchedule]]:
    client_ids = {task.client_id for task in tasks}
    manager_ids = {task.assigned_manager_id for task in tasks if task.assigned_manager_id}
    schedule_ids = {task.payment_schedule_id for task in tasks if task.payment_schedule_id}

    clients = {
        client.id: client
        for client in db.scalars(select(Client).where(Client.id.in_(client_ids)))
    } if client_ids else {}
    managers = {
        manager.id: manager
        for manager in db.scalars(select(User).where(User.id.in_(manager_ids)))
    } if manager_ids else {}
    schedules = {
        schedule.id: schedule
        for schedule in db.scalars(select(PaymentSchedule).where(PaymentSchedule.id.in_(schedule_ids)))
    } if schedule_ids else {}
    return clients, managers, schedules


def _tasks_to_responses(db: Session, tasks: list[ManagerTask]) -> list[ManagerTaskResponse]:
    clients, managers, schedules = _load_task_response_maps(db, tasks)
    return [
        _task_to_response(
            task,
            client=clients.get(task.client_id),
            manager=managers.get(task.assigned_manager_id) if task.assigned_manager_id else None,
            schedule=schedules.get(task.payment_schedule_id) if task.payment_schedule_id else None,
        )
        for task in tasks
    ]


def list_manager_tasks(
    db: Session,
    user: User,
    *,
    status: TaskStatus | None = TaskStatus.OPEN,
) -> list[ManagerTaskResponse]:
    if _should_sync_tasks(user.organization_id):
        sync_overdue_tasks(db, user)
        sync_first_payment_tasks(db, user)

    stmt = select(ManagerTask).where(ManagerTask.organization_id == user.organization_id)
    if user.role == UserRole.MANAGER:
        stmt = stmt.where(ManagerTask.assigned_manager_id == user.id)
    if status is not None:
        stmt = stmt.where(ManagerTask.status == status)

    tasks = list(db.scalars(stmt))
    visible_client_ids = {client.id for client in _visible_clients(db, user)}
    filtered = [task for task in tasks if task.client_id in visible_client_ids]
    filtered.sort(
        key=lambda task: (
            0 if task.task_type == TaskType.FIRST_PAYMENT_RECORD else 1,
            -(task.overdue_days or 0),
            task.created_at,
        ),
    )
    return _tasks_to_responses(db, filtered)


def _visible_clients(db: Session, user: User) -> list[Client]:
    stmt = select(Client).where(Client.is_deleted.is_(False))
    stmt = apply_client_visibility_filter(stmt, user)
    return list(db.scalars(stmt))


def update_manager_task(
    db: Session,
    user: User,
    task_id: UUID,
    *,
    status: TaskStatus | None = None,
    note: str | None = None,
) -> ManagerTaskResponse:
    task = db.get(ManagerTask, task_id)
    if task is None or task.organization_id != user.organization_id:
        from fastapi import HTTPException, status

        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Задача не найдена")

    ensure_client_read_access(db, user, task.client_id)
    if user.role == UserRole.MANAGER and task.assigned_manager_id != user.id:
        from fastapi import HTTPException, status

        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Нет доступа к задаче")

    if status is not None:
        task.status = status
        if status in (TaskStatus.DONE, TaskStatus.DISMISSED):
            task.completed_at = date.today()
            task.completed_by = user.id
    if note is not None:
        task.note = note

    db.commit()
    db.refresh(task)
    return _tasks_to_responses(db, [task])[0]


def create_manual_task(
    db: Session,
    user: User,
    *,
    client_id: UUID,
    title: str,
    note: str | None = None,
    due_date: date | None = None,
) -> ManagerTaskResponse:
    client = ensure_client_read_access(db, user, client_id)
    if user.role == UserRole.CALL_CENTER:
        from fastapi import HTTPException, status

        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Недостаточно прав")

    task = ManagerTask(
        organization_id=user.organization_id,
        client_id=client.id,
        assigned_manager_id=client.assigned_manager_id or user.id,
        task_type=TaskType.MANUAL,
        status=TaskStatus.OPEN,
        source=TaskSource.MANUAL,
        title=title,
        note=note,
        due_date=due_date or date.today(),
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return _tasks_to_responses(db, [task])[0]
