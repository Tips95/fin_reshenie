from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_active_user, require_owner_or_manager
from app.core.database import get_db
from app.models.client_mandatory_payment import ClientMandatoryPayment
from app.models.enums import AuditAction, MandatoryPaymentStatus, UserRole
from app.models.user import User
from app.schemas.mandatory_payment import (
    MandatoryPaymentRecord,
    MandatoryPaymentResponse,
    MandatoryPaymentUpdate,
)
from app.services.access import ensure_client_read_access, ensure_client_write_access
from app.services.audit import log_audit
from app.services.mandatory_payments import apply_mandatory_payment, refresh_mandatory_payment_status

router = APIRouter()


def _get_mandatory_payment(
    db: Session,
    *,
    client_id: UUID,
    payment_id: UUID,
) -> ClientMandatoryPayment:
    item = db.get(ClientMandatoryPayment, payment_id)
    if item is None or item.client_id != client_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Обязательный платёж не найден")
    return item


@router.get("/{client_id}/mandatory-payments", response_model=list[MandatoryPaymentResponse])
def list_mandatory_payments(
    client_id: UUID,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> list[ClientMandatoryPayment]:
    if current_user.role == UserRole.CALL_CENTER:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Недостаточно прав")
    ensure_client_read_access(db, current_user, client_id)
    stmt = (
        select(ClientMandatoryPayment)
        .where(ClientMandatoryPayment.client_id == client_id)
        .order_by(ClientMandatoryPayment.payment_type)
    )
    return list(db.scalars(stmt))


@router.patch(
    "/{client_id}/mandatory-payments/{payment_id}",
    response_model=MandatoryPaymentResponse,
)
def update_mandatory_payment(
    client_id: UUID,
    payment_id: UUID,
    payload: MandatoryPaymentUpdate,
    current_user: User = Depends(require_owner_or_manager),
    db: Session = Depends(get_db),
) -> ClientMandatoryPayment:
    ensure_client_write_access(db, current_user, client_id)
    item = _get_mandatory_payment(db, client_id=client_id, payment_id=payment_id)
    updates = payload.model_dump(exclude_unset=True)

    for field, value in updates.items():
        old_value = getattr(item, field)
        if old_value != value:
            log_audit(
                db,
                user=current_user,
                entity_type="mandatory_payment",
                entity_id=item.id,
                action=AuditAction.UPDATE,
                field_name=field,
                old_value=old_value,
                new_value=value,
            )
            setattr(item, field, value)

    if "is_applicable" in updates and updates["is_applicable"] is False:
        item.status = MandatoryPaymentStatus.NOT_APPLICABLE
    else:
        refresh_mandatory_payment_status(item)

    db.commit()
    db.refresh(item)
    return item


@router.post(
    "/{client_id}/mandatory-payments/{payment_id}/record",
    response_model=MandatoryPaymentResponse,
)
def record_mandatory_payment(
    client_id: UUID,
    payment_id: UUID,
    payload: MandatoryPaymentRecord,
    current_user: User = Depends(require_owner_or_manager),
    db: Session = Depends(get_db),
) -> ClientMandatoryPayment:
    ensure_client_write_access(db, current_user, client_id)
    item = _get_mandatory_payment(db, client_id=client_id, payment_id=payment_id)

    if not item.is_applicable:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Платёж не применим для этого клиента",
        )
    if item.planned_amount <= 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Сначала укажите плановую сумму",
        )

    remaining = item.planned_amount - item.paid_amount
    if payload.amount > remaining:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Сумма превышает остаток по обязательному платежу",
        )

    apply_mandatory_payment(db, item, payload.amount, payload.payment_date)
    if payload.comment:
        item.comment = payload.comment

    log_audit(
        db,
        user=current_user,
        entity_type="mandatory_payment",
        entity_id=item.id,
        action=AuditAction.UPDATE,
        field_name="paid_amount",
        new_value=item.paid_amount,
    )
    db.commit()
    db.refresh(item)
    return item
