from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_active_user, require_owner, require_owner_or_manager
from app.core.database import get_db
from app.models.enums import AuditAction, UserRole
from app.models.payment import Payment
from app.models.payment_schedule import PaymentSchedule
from app.models.user import User
from app.schemas.payment import PaymentCreate, PaymentResponse, PaymentUpdate
from app.services.access import ensure_client_read_access, ensure_client_write_access
from app.services.audit import log_audit
from app.services.payment_sync import sync_client_payment_schedules

router = APIRouter()


@router.get("", response_model=list[PaymentResponse])
def list_payments(
    client_id: UUID | None = Query(default=None),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> list[Payment]:
    if current_user.role == UserRole.CALL_CENTER:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Недостаточно прав")

    stmt = select(Payment).where(Payment.is_deleted.is_(False))

    if client_id is not None:
        ensure_client_read_access(db, current_user, client_id)
        stmt = stmt.where(Payment.client_id == client_id)
    elif current_user.role == UserRole.MANAGER:
        from app.models.client import Client

        stmt = stmt.join(Client, Client.id == Payment.client_id).where(
            Client.organization_id == current_user.organization_id,
            Client.assigned_manager_id == current_user.id,
            Client.is_deleted.is_(False),
        )
    else:
        from app.models.client import Client

        stmt = stmt.join(Client, Client.id == Payment.client_id).where(
            Client.organization_id == current_user.organization_id,
            Client.is_deleted.is_(False),
        )

    return list(db.scalars(stmt.order_by(Payment.payment_date.desc())))


@router.post("", response_model=PaymentResponse, status_code=status.HTTP_201_CREATED)
def create_payment(
    payload: PaymentCreate,
    current_user: User = Depends(require_owner_or_manager),
    db: Session = Depends(get_db),
) -> Payment:
    ensure_client_write_access(db, current_user, payload.client_id)

    schedule: PaymentSchedule | None = None
    if payload.payment_schedule_id is not None:
        schedule = db.get(PaymentSchedule, payload.payment_schedule_id)
        if schedule is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Строка графика не найдена")
        if schedule.installment_plan.client_id != payload.client_id:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="График не принадлежит указанному клиенту",
            )
        if payload.is_refund and payload.amount > schedule.paid_amount:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Сумма возврата не может превышать оплаченную по выбранному месяцу",
            )

    payment = Payment(
        client_id=payload.client_id,
        payment_schedule_id=payload.payment_schedule_id,
        amount=payload.amount,
        payment_date=payload.payment_date,
        comment=payload.comment,
        created_by=current_user.id,
        is_refund=payload.is_refund,
    )
    db.add(payment)
    db.flush()

    sync_client_payment_schedules(db, payload.client_id)

    log_audit(
        db,
        user=current_user,
        entity_type="payment",
        entity_id=payment.id,
        action=AuditAction.CREATE,
        new_value=payload.amount,
    )
    db.commit()
    db.refresh(payment)
    return payment


@router.patch("/{payment_id}", response_model=PaymentResponse)
def update_payment(
    payment_id: UUID,
    payload: PaymentUpdate,
    current_user: User = Depends(require_owner),
    db: Session = Depends(get_db),
) -> Payment:
    payment = db.get(Payment, payment_id)
    if payment is None or payment.is_deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Платёж не найден")

    ensure_client_write_access(db, current_user, payment.client_id)

    old_date = payment.payment_date
    payment.payment_date = payload.payment_date
    db.flush()

    sync_client_payment_schedules(db, payment.client_id)

    log_audit(
        db,
        user=current_user,
        entity_type="payment",
        entity_id=payment.id,
        action=AuditAction.UPDATE,
        field_name="payment_date",
        old_value=str(old_date),
        new_value=str(payload.payment_date),
    )
    db.commit()
    db.refresh(payment)
    return payment


@router.get("/{payment_id}", response_model=PaymentResponse)
def get_payment(
    payment_id: UUID,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> Payment:
    if current_user.role == UserRole.CALL_CENTER:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Недостаточно прав")

    payment = db.get(Payment, payment_id)
    if payment is None or payment.is_deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Платёж не найден")

    ensure_client_read_access(db, current_user, payment.client_id)
    return payment


@router.delete("/{payment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_payment(
    payment_id: UUID,
    current_user: User = Depends(require_owner),
    db: Session = Depends(get_db),
) -> None:
    payment = db.get(Payment, payment_id)
    if payment is None or payment.is_deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Платёж не найден")

    ensure_client_write_access(db, current_user, payment.client_id)

    payment.is_deleted = True
    db.flush()

    sync_client_payment_schedules(db, payment.client_id)

    log_audit(
        db,
        user=current_user,
        entity_type="payment",
        entity_id=payment.id,
        action=AuditAction.DELETE,
        field_name="is_deleted",
        old_value=False,
        new_value=True,
    )
    db.commit()
