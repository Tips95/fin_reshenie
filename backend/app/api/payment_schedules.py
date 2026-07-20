from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_active_user, require_owner, require_owner_or_manager
from app.core.database import get_db
from app.models.enums import AuditAction, PaymentScheduleStatus, UserRole
from app.models.payment_schedule import PaymentSchedule
from app.models.user import User
from app.schemas.payment_schedule import (
    PaymentScheduleCreate,
    PaymentScheduleDefer,
    PaymentScheduleResponse,
    PaymentScheduleUpdate,
    PaymentScheduleWaiveOverdue,
)
from app.services.access import (
    ensure_client_read_access,
    ensure_client_write_access,
    get_installment_plan_for_client,
)
from app.services.audit import log_audit
from app.services.payment_status import refresh_overdue_statuses
from app.services.schedule_management import (
    add_schedule_month,
    delete_schedule_item,
    update_schedule_item,
    waive_schedule_overdue,
)

router = APIRouter()


def _get_schedule_or_404(db: Session, schedule_id: UUID) -> PaymentSchedule:
    schedule = db.get(PaymentSchedule, schedule_id)
    if schedule is None:
        raise HTTPException(status_code=404, detail="Платёж в графике не найден")
    return schedule


@router.post("/{schedule_id}/defer", response_model=PaymentScheduleResponse)
def defer_payment_schedule(
    schedule_id: UUID,
    payload: PaymentScheduleDefer,
    current_user: User = Depends(require_owner_or_manager),
    db: Session = Depends(get_db),
) -> PaymentSchedule:
    schedule = _get_schedule_or_404(db, schedule_id)
    client_id = schedule.installment_plan.client_id
    ensure_client_write_access(db, current_user, client_id)

    if schedule.status == PaymentScheduleStatus.PAID:
        raise HTTPException(status_code=422, detail="Нельзя отсрочить полностью оплаченный платёж")
    if payload.deferred_until < date.today():
        raise HTTPException(status_code=422, detail="Дата отсрочки не может быть в прошлом")

    old_until = schedule.deferred_until
    old_comment = schedule.deferral_comment
    schedule.deferred_until = payload.deferred_until
    schedule.deferral_comment = payload.comment.strip()
    if schedule.status == PaymentScheduleStatus.OVERDUE:
        schedule.status = PaymentScheduleStatus.PENDING

    log_audit(
        db,
        user=current_user,
        entity_type="payment_schedule",
        entity_id=schedule.id,
        action=AuditAction.UPDATE,
        field_name="deferred_until",
        old_value=old_until,
        new_value=schedule.deferred_until,
    )
    log_audit(
        db,
        user=current_user,
        entity_type="payment_schedule",
        entity_id=schedule.id,
        action=AuditAction.UPDATE,
        field_name="deferral_comment",
        old_value=old_comment,
        new_value=schedule.deferral_comment,
    )

    refresh_overdue_statuses(db, schedule.installment_plan_id)
    db.commit()
    db.refresh(schedule)
    return schedule


@router.post("/{schedule_id}/waive-overdue", response_model=PaymentScheduleResponse)
def waive_payment_schedule_overdue(
    schedule_id: UUID,
    payload: PaymentScheduleWaiveOverdue,
    current_user: User = Depends(require_owner),
    db: Session = Depends(get_db),
) -> PaymentSchedule:
    schedule = _get_schedule_or_404(db, schedule_id)
    client_id = schedule.installment_plan.client_id
    ensure_client_write_access(db, current_user, client_id)

    old_value = schedule.overdue_waived
    waive_schedule_overdue(schedule, comment=payload.comment)

    log_audit(
        db,
        user=current_user,
        entity_type="payment_schedule",
        entity_id=schedule.id,
        action=AuditAction.UPDATE,
        field_name="overdue_waived",
        old_value=old_value,
        new_value=True,
    )

    refresh_overdue_statuses(db, schedule.installment_plan_id)
    db.commit()
    db.refresh(schedule)
    return schedule


@router.patch("/{schedule_id}", response_model=PaymentScheduleResponse)
def update_payment_schedule(
    schedule_id: UUID,
    payload: PaymentScheduleUpdate,
    current_user: User = Depends(require_owner),
    db: Session = Depends(get_db),
) -> PaymentSchedule:
    schedule = _get_schedule_or_404(db, schedule_id)
    client_id = schedule.installment_plan.client_id
    ensure_client_write_access(db, current_user, client_id)

    updates = payload.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=422, detail="Нет данных для обновления")

    old_planned = schedule.planned_amount
    old_due = schedule.due_date
    update_schedule_item(
        db,
        schedule,
        planned_amount=updates.get("planned_amount"),
        due_date=updates.get("due_date"),
    )

    if "planned_amount" in updates:
        log_audit(
            db,
            user=current_user,
            entity_type="payment_schedule",
            entity_id=schedule.id,
            action=AuditAction.UPDATE,
            field_name="planned_amount",
            old_value=old_planned,
            new_value=schedule.planned_amount,
        )
    if "due_date" in updates:
        log_audit(
            db,
            user=current_user,
            entity_type="payment_schedule",
            entity_id=schedule.id,
            action=AuditAction.UPDATE,
            field_name="due_date",
            old_value=old_due,
            new_value=schedule.due_date,
        )

    refresh_overdue_statuses(db, schedule.installment_plan_id)
    db.commit()
    db.refresh(schedule)
    return schedule


@router.delete("/{schedule_id}", status_code=204)
def delete_payment_schedule(
    schedule_id: UUID,
    current_user: User = Depends(require_owner),
    db: Session = Depends(get_db),
) -> None:
    schedule = _get_schedule_or_404(db, schedule_id)
    client_id = schedule.installment_plan.client_id
    plan_id = schedule.installment_plan_id
    ensure_client_write_access(db, current_user, client_id)

    log_audit(
        db,
        user=current_user,
        entity_type="payment_schedule",
        entity_id=schedule.id,
        action=AuditAction.DELETE,
        field_name="month_number",
        old_value=schedule.month_number,
        new_value=None,
    )

    delete_schedule_item(db, schedule)
    refresh_overdue_statuses(db, plan_id)
    db.commit()


@router.post(
    "/{client_id}/installment-plans/{plan_id}/payment-schedule",
    response_model=PaymentScheduleResponse,
    status_code=201,
)
def create_payment_schedule_item(
    client_id: UUID,
    plan_id: UUID,
    payload: PaymentScheduleCreate,
    current_user: User = Depends(require_owner),
    db: Session = Depends(get_db),
) -> PaymentSchedule:
    ensure_client_write_access(db, current_user, client_id)
    plan = get_installment_plan_for_client(db, plan_id=plan_id, client_id=client_id)

    item = add_schedule_month(
        db,
        plan,
        planned_amount=payload.planned_amount,
        due_date=payload.due_date,
    )

    log_audit(
        db,
        user=current_user,
        entity_type="payment_schedule",
        entity_id=item.id,
        action=AuditAction.CREATE,
        field_name="month_number",
        old_value=None,
        new_value=item.month_number,
    )

    refresh_overdue_statuses(db, plan_id)
    db.commit()
    db.refresh(item)
    return item


@router.get(
    "/{client_id}/installment-plans/{plan_id}/payment-schedule",
    response_model=list[PaymentScheduleResponse],
)
def list_payment_schedule(
    client_id: UUID,
    plan_id: UUID,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> list[PaymentSchedule]:
    if current_user.role == UserRole.CALL_CENTER:
        raise HTTPException(status_code=403, detail="Недостаточно прав")
    ensure_client_read_access(db, current_user, client_id)
    get_installment_plan_for_client(db, plan_id=plan_id, client_id=client_id)
    refresh_overdue_statuses(db, plan_id)
    db.commit()

    stmt = (
        select(PaymentSchedule)
        .where(PaymentSchedule.installment_plan_id == plan_id)
        .order_by(PaymentSchedule.month_number)
    )
    return list(db.scalars(stmt))


@router.get("/{schedule_id}", response_model=PaymentScheduleResponse)
def get_payment_schedule_item(
    schedule_id: UUID,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> PaymentSchedule:
    if current_user.role == UserRole.CALL_CENTER:
        raise HTTPException(status_code=403, detail="Недостаточно прав")

    schedule = db.get(PaymentSchedule, schedule_id)
    if schedule is None:
        raise HTTPException(status_code=404, detail="Платёж в графике не найден")

    plan = schedule.installment_plan
    ensure_client_read_access(db, current_user, plan.client_id)
    return schedule
