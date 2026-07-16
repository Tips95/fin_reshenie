from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import require_owner_or_manager
from app.core.database import get_db
from app.models.user import User
from app.schemas.client import ClientDetailResponse
from app.schemas.document_collection import (
    ConvertToBankruptcyRequest,
    DocumentCollectionResponse,
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
)

router = APIRouter()


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


@router.post("/{client_id}/convert-to-bankruptcy", response_model=ClientDetailResponse)
def convert_to_bankruptcy(
    client_id: UUID,
    payload: ConvertToBankruptcyRequest,
    current_user: User = Depends(require_owner_or_manager),
    db: Session = Depends(get_db),
) -> ClientDetailResponse:
    from app.api.clients import _build_client_detail, _create_installment_for_client

    client = ensure_client_write_access(db, current_user, client_id)
    convert_client_to_bankruptcy(
        db,
        client,
        debt_amount=payload.debt_amount,
        contract_date=payload.contract_date,
    )
    _create_installment_for_client(
        db,
        client=client,
        organization_id=current_user.organization_id,
    )
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
    return detail
