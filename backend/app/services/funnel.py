from collections import defaultdict
from datetime import date
from decimal import Decimal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.client import Client
from app.models.enums import (
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

PROCEDURE_STAGE_ORDER = [
    ProcedureStage.CONTRACT_SIGNED,
    ProcedureStage.DEPOSIT,
    ProcedureStage.FINANCIAL_MANAGEMENT,
    ProcedureStage.COURT,
    ProcedureStage.COMPLETED,
]

OVERDUE_ESCALATION_THRESHOLDS = (1, 4, 8, 15)


def get_funnel_overview(db: Session, user: User) -> FunnelOverview:
    stmt = select(Client).where(
        Client.is_deleted.is_(False),
        Client.engagement_stage == EngagementStage.BANKRUPTCY,
    )
    stmt = apply_client_visibility_filter(stmt, user)
    clients = list(db.scalars(stmt))

    counts = defaultdict(int)
    for client in clients:
        counts[client.procedure_stage] += 1

    stages = [
        FunnelStageItem(stage=stage, count=counts.get(stage, 0)) for stage in PROCEDURE_STAGE_ORDER
    ]
    return FunnelOverview(stages=stages, total_clients=len(clients))


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


def _task_to_response(task: ManagerTask, db: Session) -> ManagerTaskResponse:
    client = db.get(Client, task.client_id)
    manager = db.get(User, task.assigned_manager_id) if task.assigned_manager_id else None
    schedule = (
        db.get(PaymentSchedule, task.payment_schedule_id) if task.payment_schedule_id else None
    )

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


def list_manager_tasks(
    db: Session,
    user: User,
    *,
    status: TaskStatus | None = TaskStatus.OPEN,
) -> list[ManagerTaskResponse]:
    sync_overdue_tasks(db, user)

    stmt = select(ManagerTask).where(ManagerTask.organization_id == user.organization_id)
    if user.role == UserRole.MANAGER:
        stmt = stmt.where(ManagerTask.assigned_manager_id == user.id)
    if status is not None:
        stmt = stmt.where(ManagerTask.status == status)

    tasks = list(db.scalars(stmt.order_by(ManagerTask.overdue_days.desc(), ManagerTask.created_at.desc())))
    visible_client_ids = {client.id for client in _visible_clients(db, user)}
    filtered = [task for task in tasks if task.client_id in visible_client_ids]
    return [_task_to_response(task, db) for task in filtered]


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
    return _task_to_response(task, db)


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
    return _task_to_response(task, db)
