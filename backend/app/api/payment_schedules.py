from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_active_user, require_owner_or_manager
from app.core.database import get_db
from app.models.enums import AuditAction, PaymentScheduleStatus, UserRole
from app.models.payment_schedule import PaymentSchedule
from app.models.user import User
from app.schemas.payment_schedule import PaymentScheduleDefer, PaymentScheduleResponse
from app.services.access import (
    ensure_client_read_access,
    ensure_client_write_access,
    get_installment_plan_for_client,
)
from app.services.audit import log_audit
from app.services.payment_status import refresh_overdue_statuses

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
