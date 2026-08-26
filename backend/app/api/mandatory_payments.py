from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.deps import get_current_active_user, require_owner
from app.core.database import get_db
from app.models.client_mandatory_payment import ClientMandatoryPayment
from app.models.enums import AuditAction, MandatoryPaymentStatus, UserRole
from app.models.user import User
from app.schemas.mandatory_payment import (
    MandatoryPaymentRecord,
    MandatoryPaymentRecordUpdate,
    MandatoryPaymentResponse,
    MandatoryPaymentUpdate,
)
from app.services.access import ensure_client_read_access, ensure_client_write_access
from app.services.audit import log_audit
from app.services.mandatory_payments import (
    apply_mandatory_payment,
    build_mandatory_payment_response,
    delete_mandatory_payment_record,
    refresh_mandatory_payment_status,
    update_mandatory_payment_record as apply_mandatory_record_update,
)

router = APIRouter()


def _to_mandatory_response(item: ClientMandatoryPayment) -> MandatoryPaymentResponse:
    return build_mandatory_payment_response(item)


def _get_mandatory_payment(
    db: Session,
    *,
    client_id: UUID,
    payment_id: UUID,
) -> ClientMandatoryPayment:
    item = db.get(ClientMandatoryPayment, payment_id)
    if item is None or item.client_id != client_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Обязательный платёж не найден")
    db.refresh(item, attribute_names=["payment_records"])
    return item


@router.get("/{client_id}/mandatory-payments", response_model=list[MandatoryPaymentResponse])
def list_mandatory_payments(
    client_id: UUID,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> list[MandatoryPaymentResponse]:
    if current_user.role == UserRole.CALL_CENTER:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Недостаточно прав")
    ensure_client_read_access(db, current_user, client_id)
    stmt = (
        select(ClientMandatoryPayment)
        .options(selectinload(ClientMandatoryPayment.payment_records))
        .where(ClientMandatoryPayment.client_id == client_id)
        .order_by(ClientMandatoryPayment.payment_type)
    )
    items = list(db.scalars(stmt))
    return [_to_mandatory_response(item) for item in items]


@router.patch(
    "/{client_id}/mandatory-payments/{payment_id}",
    response_model=MandatoryPaymentResponse,
)
def update_mandatory_payment(
    client_id: UUID,
    payment_id: UUID,
    payload: MandatoryPaymentUpdate,
    current_user: User = Depends(require_owner),
    db: Session = Depends(get_db),
) -> MandatoryPaymentResponse:
    ensure_client_write_access(db, current_user, client_id)
    item = _get_mandatory_payment(db, client_id=client_id, payment_id=payment_id)
    updates = payload.model_dump(exclude_unset=True)

    if "planned_amount" in updates and updates["planned_amount"] is not None:
        if updates["planned_amount"] < item.paid_amount:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Плановая сумма не может быть меньше уже оплаченной",
            )

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
    db.refresh(item, attribute_names=["payment_records"])
    return _to_mandatory_response(item)


@router.post(
    "/{client_id}/mandatory-payments/{payment_id}/record",
    response_model=MandatoryPaymentResponse,
)
def record_mandatory_payment(
    client_id: UUID,
    payment_id: UUID,
    payload: MandatoryPaymentRecord,
    current_user: User = Depends(require_owner),
    db: Session = Depends(get_db),
) -> MandatoryPaymentResponse:
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
    db.refresh(item, attribute_names=["payment_records"])
    return _to_mandatory_response(item)


@router.patch(
    "/{client_id}/mandatory-payments/{payment_id}/records/{record_id}",
    response_model=MandatoryPaymentResponse,
)
def update_mandatory_payment_record(
    client_id: UUID,
    payment_id: UUID,
    record_id: UUID,
    payload: MandatoryPaymentRecordUpdate,
    current_user: User = Depends(require_owner),
    db: Session = Depends(get_db),
) -> MandatoryPaymentResponse:
    ensure_client_write_access(db, current_user, client_id)
    item = _get_mandatory_payment(db, client_id=client_id, payment_id=payment_id)
    updates = payload.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Нет данных для обновления")
    try:
        record = apply_mandatory_record_update(
            item,
            record_id,
            payment_date=updates.get("payment_date"),
            amount=updates.get("amount"),
        )
    except ValueError as exc:
        if str(exc) == "record_not_found":
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Запись не найдена") from exc
        if str(exc) == "amount_exceeds_remaining":
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Сумма превышает остаток по обязательному платежу",
            ) from exc
        raise

    for field_name, new_value in updates.items():
        log_audit(
            db,
            user=current_user,
            entity_type="mandatory_payment_record",
            entity_id=record.id,
            action=AuditAction.UPDATE,
            field_name=field_name,
            new_value=new_value,
        )
    db.commit()
    db.refresh(item, attribute_names=["payment_records"])
    return _to_mandatory_response(item)


@router.delete(
    "/{client_id}/mandatory-payments/{payment_id}/records/{record_id}",
    response_model=MandatoryPaymentResponse,
)
def remove_mandatory_payment_record(
    client_id: UUID,
    payment_id: UUID,
    record_id: UUID,
    current_user: User = Depends(require_owner),
    db: Session = Depends(get_db),
) -> MandatoryPaymentResponse:
    ensure_client_write_access(db, current_user, client_id)
    item = _get_mandatory_payment(db, client_id=client_id, payment_id=payment_id)
    try:
        delete_mandatory_payment_record(db, item, record_id)
    except ValueError as exc:
        if str(exc) == "record_not_found":
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Запись не найдена") from exc
        raise

    log_audit(
        db,
        user=current_user,
        entity_type="mandatory_payment_record",
        entity_id=record_id,
        action=AuditAction.DELETE,
    )
    db.commit()
    db.refresh(item, attribute_names=["payment_records"])
    return _to_mandatory_response(item)
