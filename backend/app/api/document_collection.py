from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import require_owner_or_manager
from app.core.database import get_db
from app.models.user import User
from app.schemas.client import ClientDetailResponse
from app.schemas.document_collection import (
    ConvertToBankruptcyRequest,
    DocumentCollectionResponse,
    DocumentCollectionUpdate,
    RecordDocumentCollectionPayment,
)
from app.models.enums import AuditAction
from app.services.access import ensure_client_write_access
from app.services.audit import log_audit
from app.services.document_collection import (
    convert_client_to_bankruptcy,
    get_document_collection,
    record_document_collection_payment,
    to_document_collection_response,
    unrecord_document_collection_payment,
    update_document_collection_amounts,
)

router = APIRouter()


@router.patch(
    "/{client_id}/document-collection",
    response_model=DocumentCollectionResponse,
)
def patch_document_collection(
    client_id: UUID,
    payload: DocumentCollectionUpdate,
    current_user: User = Depends(require_owner_or_manager),
    db: Session = Depends(get_db),
) -> DocumentCollectionResponse:
    client = ensure_client_write_access(db, current_user, client_id)
    existing = get_document_collection(db, client.id)
    old_values = {
        "collection_fee": existing.collection_fee if existing is not None else None,
        "notary_fee": existing.notary_fee if existing is not None else None,
        "manager_commission": existing.manager_commission if existing is not None else None,
        "total_amount": existing.total_amount if existing is not None else None,
        "paid_date": existing.paid_date if existing is not None else None,
    }
    item = update_document_collection_amounts(
        db,
        client,
        collection_fee=payload.collection_fee,
        notary_fee=payload.notary_fee,
        manager_commission=payload.manager_commission,
        actor_role=current_user.role,
        paid_date=payload.paid_date,
    )
    for field_name, old_value in old_values.items():
        new_value = getattr(item, field_name)
        if old_value != new_value:
            log_audit(
                db,
                user=current_user,
                entity_type="document_collection",
                entity_id=item.id,
                action=AuditAction.UPDATE,
                field_name=field_name,
                old_value=old_value,
                new_value=new_value,
            )
    db.commit()
    db.refresh(item)
    return to_document_collection_response(item)


@router.post(
    "/{client_id}/document-collection/record",
    response_model=DocumentCollectionResponse,
)
def record_document_collection(
    client_id: UUID,
    payload: RecordDocumentCollectionPayment,
    current_user: User = Depends(require_owner_or_manager),
    db: Session = Depends(get_db),
) -> DocumentCollectionResponse:
    client = ensure_client_write_access(db, current_user, client_id)
    item = record_document_collection_payment(db, client, payment_date=payload.payment_date)
    log_audit(
        db,
        user=current_user,
        entity_type="document_collection",
        entity_id=item.id,
        action=AuditAction.UPDATE,
        field_name="status",
        old_value="pending",
        new_value="paid",
    )
    db.commit()
    db.refresh(item)
    return to_document_collection_response(item)


@router.post(
    "/{client_id}/document-collection/unrecord",
    response_model=DocumentCollectionResponse,
)
def unrecord_document_collection(
    client_id: UUID,
    current_user: User = Depends(require_owner_or_manager),
    db: Session = Depends(get_db),
) -> DocumentCollectionResponse:
    client = ensure_client_write_access(db, current_user, client_id)
    item = unrecord_document_collection_payment(db, client)
    log_audit(
        db,
        user=current_user,
        entity_type="document_collection",
        entity_id=item.id,
        action=AuditAction.UPDATE,
        field_name="status",
        old_value="paid",
        new_value="pending",
    )
    db.commit()
    db.refresh(item)
    return to_document_collection_response(item)


@router.post("/{client_id}/convert-to-bankruptcy", response_model=ClientDetailResponse)
def convert_to_bankruptcy(
    client_id: UUID,
    payload: ConvertToBankruptcyRequest,
    current_user: User = Depends(require_owner_or_manager),
    db: Session = Depends(get_db),
) -> ClientDetailResponse:
    from app.api.clients import (
        _build_client_detail,
        _create_installment_for_client,
        _create_manual_installment_for_client,
    )

    client = ensure_client_write_access(db, current_user, client_id)
    try:
        debt_amount = payload.debt_amount if payload.auto_installment else Decimal("0.00")
        convert_client_to_bankruptcy(
            db,
            client,
            debt_amount=debt_amount,
            contract_date=payload.contract_date,
        )
        if payload.auto_installment:
            _create_installment_for_client(
                db,
                client=client,
                organization_id=current_user.organization_id,
            )
        else:
            _create_manual_installment_for_client(
                db,
                client=client,
                contract_total=payload.contract_total,
            )
        from app.services.funnel import try_ensure_first_payment_task_for_manager_client

        log_audit(
            db,
            user=current_user,
            entity_type="client",
            entity_id=client.id,
            action=AuditAction.UPDATE,
            field_name="engagement_stage",
            old_value="document_collection",
            new_value="bankruptcy",
        )
        detail = _build_client_detail(db, client)
        db.commit()
        try_ensure_first_payment_task_for_manager_client(
            db,
            client=client,
            actor=current_user,
        )
    except HTTPException:
        db.rollback()
        raise
    return detail
