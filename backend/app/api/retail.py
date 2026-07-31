from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload, selectinload

from app.api.deps import get_current_active_user, require_owner, require_roles
from app.core.database import get_db
from app.core.security import get_password_hash
from app.models.enums import AuditAction, OrganizationType, RetailContractStatus, UserRole
from app.models.retail_client import RetailClient
from app.models.retail_contract import RetailContract
from app.models.retail_overdue_log import RetailOverdueLog
from app.models.retail_payment import RetailPayment
from app.models.user import User
from app.schemas.retail import (
    RetailClientCreate,
    RetailClientResponse,
    RetailClientUpdate,
    RetailContractBrief,
    RetailContractCreate,
    RetailContractDetail,
    RetailDashboardSummary,
    RetailOverdueLogCreate,
    RetailOverdueLogResponse,
    RetailPaymentCreate,
    RetailPaymentResponse,
    RetailPaymentScheduleResponse,
    RetailTermRateResponse,
)
from app.schemas.user import (
    RetailInvestorCreate,
    RetailInvestorSelfUpdate,
    RetailInvestorUpdate,
    UserResponse,
)
from app.services.accounts import assert_contacts_available
from app.services.audit import log_audit
from app.services.retail_access import (
    apply_investor_contract_filter,
    ensure_contract_access,
    ensure_retail_organization,
    get_retail_client,
    get_retail_contract,
)
from app.services.retail_contracts import create_retail_contract, sync_contract_status
from app.services.retail_dashboard import build_contract_brief, get_retail_dashboard
from app.services.retail_deletion import hard_delete_retail_client, hard_delete_retail_contract
from app.services.file_storage import (
    delete_storage_key,
    read_and_validate_pdf,
    resolve_storage_path,
    retail_client_guarantor_passport_key,
    retail_client_passport_key,
    retail_contract_signed_key,
    save_bytes,
)
from app.services.retail_payments import cancel_retail_payment, record_retail_payment
from app.services.validation import format_passport_display
from app.models.retail_term_rate import RetailTermRate

router = APIRouter()
# Инвестор видит только своё; менеджер и колл-центр работают с клиентами и договорами.
require_retail_user = require_roles(
    UserRole.OWNER,
    UserRole.MANAGER,
    UserRole.CALL_CENTER,
    UserRole.INVESTOR,
)
require_retail_staff = require_roles(
    UserRole.OWNER,
    UserRole.MANAGER,
    UserRole.CALL_CENTER,
)


def _client_contracts_count(db: Session, user: User, client_id: UUID) -> int:
    stmt = select(func.count()).where(
        RetailContract.retail_client_id == client_id,
        RetailContract.is_deleted.is_(False),
    )
    if user.role == UserRole.INVESTOR:
        stmt = stmt.where(RetailContract.investor_id == user.id)
    return db.scalar(stmt) or 0


def _ensure_investor_client_access(db: Session, user: User, client_id: UUID) -> None:
    if user.role != UserRole.INVESTOR:
        return
    has_access = db.scalar(
        select(func.count()).where(
            RetailContract.retail_client_id == client_id,
            RetailContract.investor_id == user.id,
            RetailContract.is_deleted.is_(False),
        )
    )
    if not has_access:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Нет доступа к клиенту")


def _serialize_client(db: Session, user: User, client: RetailClient) -> RetailClientResponse:
    passport_pdf_path = getattr(client, "passport_pdf_path", None)
    passport_pdf_filename = getattr(client, "passport_pdf_filename", None)
    guarantor_passport_pdf_path = getattr(client, "guarantor_passport_pdf_path", None)
    guarantor_passport_pdf_filename = getattr(client, "guarantor_passport_pdf_filename", None)
    return RetailClientResponse(
        id=client.id,
        organization_id=client.organization_id,
        full_name=client.full_name,
        phone=client.phone,
        passport=format_passport_display(client.passport),
        address=client.address,
        guarantor_full_name=client.guarantor_full_name,
        guarantor_phone=client.guarantor_phone,
        guarantor_passport=format_passport_display(client.guarantor_passport),
        contracts_count=_client_contracts_count(db, user, client.id),
        has_passport_pdf=bool(passport_pdf_path),
        passport_pdf_filename=passport_pdf_filename,
        has_guarantor_passport_pdf=bool(guarantor_passport_pdf_path),
        guarantor_passport_pdf_filename=guarantor_passport_pdf_filename,
    )


@router.get("/dashboard/summary", response_model=RetailDashboardSummary)
def retail_dashboard_summary(
    current_user: User = Depends(require_retail_user),
    db: Session = Depends(get_db),
) -> RetailDashboardSummary:
    ensure_retail_organization(db, current_user)
    summary = get_retail_dashboard(db, current_user)
    db.commit()
    return summary


@router.get("/term-rates", response_model=list[RetailTermRateResponse])
def list_term_rates(
    current_user: User = Depends(require_retail_user),
    db: Session = Depends(get_db),
) -> list[RetailTermRate]:
    ensure_retail_organization(db, current_user)
    stmt = (
        select(RetailTermRate)
        .where(
            RetailTermRate.organization_id == current_user.organization_id,
            RetailTermRate.is_active.is_(True),
        )
        .order_by(RetailTermRate.term_months)
    )
    return list(db.scalars(stmt))


@router.get("/clients", response_model=list[RetailClientResponse])
def list_clients(
    current_user: User = Depends(require_retail_user),
    db: Session = Depends(get_db),
) -> list[RetailClientResponse]:
    ensure_retail_organization(db, current_user)
    stmt = select(RetailClient).where(
        RetailClient.organization_id == current_user.organization_id,
        RetailClient.is_deleted.is_(False),
    )
    if current_user.role == UserRole.INVESTOR:
        stmt = stmt.where(
            RetailClient.id.in_(
                select(RetailContract.retail_client_id).where(
                    RetailContract.investor_id == current_user.id,
                    RetailContract.is_deleted.is_(False),
                )
            )
        )
    clients = list(db.scalars(stmt.order_by(RetailClient.full_name)))
    return [_serialize_client(db, current_user, client) for client in clients]


@router.post("/clients", response_model=RetailClientResponse, status_code=status.HTTP_201_CREATED)
def create_client(
    payload: RetailClientCreate,
    current_user: User = Depends(require_retail_staff),
    db: Session = Depends(get_db),
) -> RetailClientResponse:
    ensure_retail_organization(db, current_user)
    client = RetailClient(
        organization_id=current_user.organization_id,
        full_name=payload.full_name.strip(),
        phone=payload.phone.strip(),
        passport=payload.passport,
        address=payload.address.strip(),
        guarantor_full_name=payload.guarantor_full_name.strip(),
        guarantor_phone=payload.guarantor_phone.strip(),
        guarantor_passport=payload.guarantor_passport,
    )
    db.add(client)
    db.flush()
    log_audit(
        db,
        user=current_user,
        entity_type="retail_client",
        entity_id=client.id,
        action=AuditAction.CREATE,
    )
    db.commit()
    db.refresh(client)
    return _serialize_client(db, current_user, client)


@router.delete("/clients/{client_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_client(
    client_id: UUID,
    current_user: User = Depends(require_owner),
    db: Session = Depends(get_db),
) -> None:
    ensure_retail_organization(db, current_user)
    client = get_retail_client(db, client_id=client_id, organization_id=current_user.organization_id)
    log_audit(
        db,
        user=current_user,
        entity_type="retail_client",
        entity_id=client.id,
        action=AuditAction.DELETE,
        field_name="hard_delete",
        old_value=client.full_name,
    )
    hard_delete_retail_client(db, client.id)
    db.commit()


@router.get("/clients/{client_id}", response_model=RetailClientResponse)
def get_client(
    client_id: UUID,
    current_user: User = Depends(require_retail_user),
    db: Session = Depends(get_db),
) -> RetailClientResponse:
    ensure_retail_organization(db, current_user)
    client = get_retail_client(db, client_id=client_id, organization_id=current_user.organization_id)
    _ensure_investor_client_access(db, current_user, client.id)
    return _serialize_client(db, current_user, client)


@router.patch("/clients/{client_id}", response_model=RetailClientResponse)
def update_client(
    client_id: UUID,
    payload: RetailClientUpdate,
    current_user: User = Depends(require_retail_staff),
    db: Session = Depends(get_db),
) -> RetailClientResponse:
    ensure_retail_organization(db, current_user)
    client = get_retail_client(db, client_id=client_id, organization_id=current_user.organization_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        if value is not None:
            setattr(client, field, value.strip() if isinstance(value, str) else value)
    log_audit(
        db,
        user=current_user,
        entity_type="retail_client",
        entity_id=client.id,
        action=AuditAction.UPDATE,
    )
    db.commit()
    db.refresh(client)
    return _serialize_client(db, current_user, client)


@router.post("/clients/{client_id}/passport-pdf", response_model=RetailClientResponse)
async def upload_client_passport_pdf(
    client_id: UUID,
    file: UploadFile = File(...),
    current_user: User = Depends(require_retail_staff),
    db: Session = Depends(get_db),
) -> RetailClientResponse:
    ensure_retail_organization(db, current_user)
    client = get_retail_client(db, client_id=client_id, organization_id=current_user.organization_id)
    content, filename = await read_and_validate_pdf(file)
    storage_key = retail_client_passport_key(current_user.organization_id, client.id)
    delete_storage_key(client.passport_pdf_path)
    save_bytes(storage_key, content)
    client.passport_pdf_path = storage_key
    client.passport_pdf_filename = filename
    log_audit(
        db,
        user=current_user,
        entity_type="retail_client",
        entity_id=client.id,
        action=AuditAction.UPDATE,
        field_name="passport_pdf",
        new_value=filename,
    )
    db.commit()
    db.refresh(client)
    return _serialize_client(db, current_user, client)


@router.get("/clients/{client_id}/passport-pdf")
def download_client_passport_pdf(
    client_id: UUID,
    current_user: User = Depends(require_retail_user),
    db: Session = Depends(get_db),
) -> FileResponse:
    ensure_retail_organization(db, current_user)
    client = get_retail_client(db, client_id=client_id, organization_id=current_user.organization_id)
    _ensure_investor_client_access(db, current_user, client.id)
    if not client.passport_pdf_path:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="PDF паспорта не загружен")
    path = resolve_storage_path(client.passport_pdf_path)
    if not path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Файл не найден")
    return FileResponse(
        path,
        media_type="application/pdf",
        filename=client.passport_pdf_filename or "passport.pdf",
    )


@router.delete("/clients/{client_id}/passport-pdf", response_model=RetailClientResponse)
def delete_client_passport_pdf(
    client_id: UUID,
    current_user: User = Depends(require_retail_staff),
    db: Session = Depends(get_db),
) -> RetailClientResponse:
    ensure_retail_organization(db, current_user)
    client = get_retail_client(db, client_id=client_id, organization_id=current_user.organization_id)
    if not client.passport_pdf_path:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="PDF паспорта не загружен")
    delete_storage_key(client.passport_pdf_path)
    old_name = client.passport_pdf_filename
    client.passport_pdf_path = None
    client.passport_pdf_filename = None
    log_audit(
        db,
        user=current_user,
        entity_type="retail_client",
        entity_id=client.id,
        action=AuditAction.UPDATE,
        field_name="passport_pdf",
        old_value=old_name,
        new_value=None,
    )
    db.commit()
    db.refresh(client)
    return _serialize_client(db, current_user, client)


@router.post("/clients/{client_id}/guarantor-passport-pdf", response_model=RetailClientResponse)
async def upload_guarantor_passport_pdf(
    client_id: UUID,
    file: UploadFile = File(...),
    current_user: User = Depends(require_retail_staff),
    db: Session = Depends(get_db),
) -> RetailClientResponse:
    ensure_retail_organization(db, current_user)
    client = get_retail_client(db, client_id=client_id, organization_id=current_user.organization_id)
    content, filename = await read_and_validate_pdf(file)
    storage_key = retail_client_guarantor_passport_key(current_user.organization_id, client.id)
    delete_storage_key(client.guarantor_passport_pdf_path)
    save_bytes(storage_key, content)
    client.guarantor_passport_pdf_path = storage_key
    client.guarantor_passport_pdf_filename = filename
    log_audit(
        db,
        user=current_user,
        entity_type="retail_client",
        entity_id=client.id,
        action=AuditAction.UPDATE,
        field_name="guarantor_passport_pdf",
        new_value=filename,
    )
    db.commit()
    db.refresh(client)
    return _serialize_client(db, current_user, client)


@router.get("/clients/{client_id}/guarantor-passport-pdf")
def download_guarantor_passport_pdf(
    client_id: UUID,
    current_user: User = Depends(require_retail_user),
    db: Session = Depends(get_db),
) -> FileResponse:
    ensure_retail_organization(db, current_user)
    client = get_retail_client(db, client_id=client_id, organization_id=current_user.organization_id)
    _ensure_investor_client_access(db, current_user, client.id)
    if not client.guarantor_passport_pdf_path:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="PDF паспорта поручителя не загружен")
    path = resolve_storage_path(client.guarantor_passport_pdf_path)
    if not path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Файл не найден")
    return FileResponse(
        path,
        media_type="application/pdf",
        filename=client.guarantor_passport_pdf_filename or "guarantor-passport.pdf",
    )


@router.delete("/clients/{client_id}/guarantor-passport-pdf", response_model=RetailClientResponse)
def delete_guarantor_passport_pdf(
    client_id: UUID,
    current_user: User = Depends(require_retail_staff),
    db: Session = Depends(get_db),
) -> RetailClientResponse:
    ensure_retail_organization(db, current_user)
    client = get_retail_client(db, client_id=client_id, organization_id=current_user.organization_id)
    if not client.guarantor_passport_pdf_path:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="PDF паспорта поручителя не загружен")
    delete_storage_key(client.guarantor_passport_pdf_path)
    old_name = client.guarantor_passport_pdf_filename
    client.guarantor_passport_pdf_path = None
    client.guarantor_passport_pdf_filename = None
    log_audit(
        db,
        user=current_user,
        entity_type="retail_client",
        entity_id=client.id,
        action=AuditAction.UPDATE,
        field_name="guarantor_passport_pdf",
        old_value=old_name,
        new_value=None,
    )
    db.commit()
    db.refresh(client)
    return _serialize_client(db, current_user, client)


@router.get("/contracts", response_model=list[RetailContractBrief])
def list_contracts(
    status_filter: RetailContractStatus | None = None,
    retail_client_id: UUID | None = None,
    current_user: User = Depends(require_retail_user),
    db: Session = Depends(get_db),
) -> list[RetailContractBrief]:
    ensure_retail_organization(db, current_user)
    stmt = (
        select(RetailContract)
        .options(
            joinedload(RetailContract.client),
            joinedload(RetailContract.investor),
            selectinload(RetailContract.payment_schedule),
            selectinload(RetailContract.payments),
        )
        .where(
            RetailContract.organization_id == current_user.organization_id,
            RetailContract.is_deleted.is_(False),
        )
        .order_by(RetailContract.contract_date.desc())
    )
    stmt = apply_investor_contract_filter(stmt, current_user)
    if status_filter is not None:
        stmt = stmt.where(RetailContract.status == status_filter)
    if retail_client_id is not None:
        stmt = stmt.where(RetailContract.retail_client_id == retail_client_id)
    contracts = list(db.scalars(stmt))
    result: list[RetailContractBrief] = []
    for contract in contracts:
        sync_contract_status(contract)
        result.append(RetailContractBrief(**build_contract_brief(contract)))
    db.commit()
    return result


@router.post("/contracts", response_model=RetailContractDetail, status_code=status.HTTP_201_CREATED)
def create_contract(
    payload: RetailContractCreate,
    current_user: User = Depends(require_retail_staff),
    db: Session = Depends(get_db),
) -> RetailContractDetail:
    ensure_retail_organization(db, current_user)
    contract = create_retail_contract(
        db,
        current_user,
        retail_client_id=payload.retail_client_id,
        investor_id=payload.investor_id,
        product_name=payload.product_name,
        product_price=payload.product_price,
        term_months=payload.term_months,
        down_payment=payload.down_payment,
        contract_date=payload.contract_date,
    )
    log_audit(
        db,
        user=current_user,
        entity_type="retail_contract",
        entity_id=contract.id,
        action=AuditAction.CREATE,
    )
    db.commit()
    contract = get_retail_contract(db, contract_id=contract.id, organization_id=current_user.organization_id)
    return RetailContractDetail(
        **build_contract_brief(contract),
        payment_schedule=[
            RetailPaymentScheduleResponse.model_validate(item) for item in contract.payment_schedule
        ],
        payments=[],
        overdue_logs=[],
    )


@router.delete("/contracts/{contract_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_contract(
    contract_id: UUID,
    current_user: User = Depends(require_owner),
    db: Session = Depends(get_db),
) -> None:
    ensure_retail_organization(db, current_user)
    contract = get_retail_contract(db, contract_id=contract_id, organization_id=current_user.organization_id)
    log_audit(
        db,
        user=current_user,
        entity_type="retail_contract",
        entity_id=contract.id,
        action=AuditAction.DELETE,
        field_name="hard_delete",
        old_value=contract.product_name,
    )
    hard_delete_retail_contract(db, contract.id)
    db.commit()


@router.get("/contracts/{contract_id}", response_model=RetailContractDetail)
def get_contract(
    contract_id: UUID,
    current_user: User = Depends(require_retail_user),
    db: Session = Depends(get_db),
) -> RetailContractDetail:
    ensure_retail_organization(db, current_user)
    contract = get_retail_contract(db, contract_id=contract_id, organization_id=current_user.organization_id)
    ensure_contract_access(db, current_user, contract)
    sync_contract_status(contract)
    db.commit()
    return RetailContractDetail(
        **build_contract_brief(contract),
        payment_schedule=[
            RetailPaymentScheduleResponse.model_validate(item) for item in contract.payment_schedule
        ],
        payments=[RetailPaymentResponse.model_validate(item) for item in contract.payments if not item.is_deleted],
        overdue_logs=[RetailOverdueLogResponse.model_validate(item) for item in contract.overdue_logs],
    )


@router.post("/contracts/{contract_id}/signed-contract-pdf", response_model=RetailContractDetail)
async def upload_signed_contract_pdf(
    contract_id: UUID,
    file: UploadFile = File(...),
    current_user: User = Depends(require_retail_staff),
    db: Session = Depends(get_db),
) -> RetailContractDetail:
    ensure_retail_organization(db, current_user)
    contract = get_retail_contract(db, contract_id=contract_id, organization_id=current_user.organization_id)
    content, filename = await read_and_validate_pdf(file)
    storage_key = retail_contract_signed_key(current_user.organization_id, contract.id)
    delete_storage_key(contract.signed_contract_pdf_path)
    save_bytes(storage_key, content)
    contract.signed_contract_pdf_path = storage_key
    contract.signed_contract_pdf_filename = filename
    log_audit(
        db,
        user=current_user,
        entity_type="retail_contract",
        entity_id=contract.id,
        action=AuditAction.UPDATE,
        field_name="signed_contract_pdf",
        new_value=filename,
    )
    db.commit()
    contract = get_retail_contract(db, contract_id=contract.id, organization_id=current_user.organization_id)
    return RetailContractDetail(
        **build_contract_brief(contract),
        payment_schedule=[
            RetailPaymentScheduleResponse.model_validate(item) for item in contract.payment_schedule
        ],
        payments=[RetailPaymentResponse.model_validate(item) for item in contract.payments if not item.is_deleted],
        overdue_logs=[RetailOverdueLogResponse.model_validate(item) for item in contract.overdue_logs],
    )


@router.get("/contracts/{contract_id}/signed-contract-pdf")
def download_signed_contract_pdf(
    contract_id: UUID,
    current_user: User = Depends(require_retail_user),
    db: Session = Depends(get_db),
) -> FileResponse:
    ensure_retail_organization(db, current_user)
    contract = get_retail_contract(db, contract_id=contract_id, organization_id=current_user.organization_id)
    ensure_contract_access(db, current_user, contract)
    if not contract.signed_contract_pdf_path:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Подписанный договор не загружен")
    path = resolve_storage_path(contract.signed_contract_pdf_path)
    if not path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Файл не найден")
    return FileResponse(
        path,
        media_type="application/pdf",
        filename=contract.signed_contract_pdf_filename or "contract.pdf",
    )


@router.delete("/contracts/{contract_id}/signed-contract-pdf", response_model=RetailContractDetail)
def delete_signed_contract_pdf(
    contract_id: UUID,
    current_user: User = Depends(require_retail_staff),
    db: Session = Depends(get_db),
) -> RetailContractDetail:
    ensure_retail_organization(db, current_user)
    contract = get_retail_contract(db, contract_id=contract_id, organization_id=current_user.organization_id)
    if not contract.signed_contract_pdf_path:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Подписанный договор не загружен")
    delete_storage_key(contract.signed_contract_pdf_path)
    old_name = contract.signed_contract_pdf_filename
    contract.signed_contract_pdf_path = None
    contract.signed_contract_pdf_filename = None
    log_audit(
        db,
        user=current_user,
        entity_type="retail_contract",
        entity_id=contract.id,
        action=AuditAction.UPDATE,
        field_name="signed_contract_pdf",
        old_value=old_name,
        new_value=None,
    )
    db.commit()
    contract = get_retail_contract(db, contract_id=contract.id, organization_id=current_user.organization_id)
    return RetailContractDetail(
        **build_contract_brief(contract),
        payment_schedule=[
            RetailPaymentScheduleResponse.model_validate(item) for item in contract.payment_schedule
        ],
        payments=[RetailPaymentResponse.model_validate(item) for item in contract.payments if not item.is_deleted],
        overdue_logs=[RetailOverdueLogResponse.model_validate(item) for item in contract.overdue_logs],
    )


@router.post("/contracts/{contract_id}/payments", response_model=RetailPaymentResponse)
def create_payment(
    contract_id: UUID,
    payload: RetailPaymentCreate,
    current_user: User = Depends(require_retail_user),
    db: Session = Depends(get_db),
) -> RetailPayment:
    ensure_retail_organization(db, current_user)
    payment = record_retail_payment(
        db,
        current_user,
        contract_id=contract_id,
        amount=payload.amount,
        payment_date=payload.payment_date,
        payment_type=payload.payment_type,
        payment_schedule_id=payload.payment_schedule_id,
        comment=payload.comment,
    )
    log_audit(
        db,
        user=current_user,
        entity_type="retail_payment",
        entity_id=payment.id,
        action=AuditAction.CREATE,
    )
    db.commit()
    db.refresh(payment)
    return payment


@router.delete("/payments/{payment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_payment(
    payment_id: UUID,
    current_user: User = Depends(require_owner),
    db: Session = Depends(get_db),
) -> None:
    ensure_retail_organization(db, current_user)
    payment = db.get(RetailPayment, payment_id)
    if payment is None or payment.is_deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Платёж не найден")
    if payment.organization_id != current_user.organization_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Платёж не найден")

    cancel_retail_payment(db, payment)
    log_audit(
        db,
        user=current_user,
        entity_type="retail_payment",
        entity_id=payment.id,
        action=AuditAction.DELETE,
        field_name="is_deleted",
        old_value=False,
        new_value=True,
    )
    db.commit()


@router.post("/contracts/{contract_id}/overdue-logs", response_model=RetailOverdueLogResponse)
def create_overdue_log(
    contract_id: UUID,
    payload: RetailOverdueLogCreate,
    current_user: User = Depends(require_retail_user),
    db: Session = Depends(get_db),
) -> RetailOverdueLog:
    ensure_retail_organization(db, current_user)
    contract = get_retail_contract(db, contract_id=contract_id, organization_id=current_user.organization_id)
    ensure_contract_access(db, current_user, contract)
    if contract.status != RetailContractStatus.OVERDUE:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Журнал просрочки доступен только для просроченных договоров",
        )
    entry = RetailOverdueLog(
        retail_contract_id=contract.id,
        action_date=payload.action_date,
        comment=payload.comment.strip(),
        promised_date=payload.promised_date,
        status=payload.status,
        created_by_id=current_user.id,
    )
    db.add(entry)
    db.flush()
    log_audit(
        db,
        user=current_user,
        entity_type="retail_overdue_log",
        entity_id=entry.id,
        action=AuditAction.CREATE,
    )
    db.commit()
    db.refresh(entry)
    return entry


@router.get("/investors", response_model=list[UserResponse])
def list_investors(
    current_user: User = Depends(require_retail_staff),
    db: Session = Depends(get_db),
) -> list[User]:
    ensure_retail_organization(db, current_user)
    return list(
        db.scalars(
            select(User)
            .where(
                User.organization_id == current_user.organization_id,
                User.role == UserRole.INVESTOR,
                User.is_active.is_(True),
            )
            .order_by(User.full_name)
        )
    )


@router.get("/investors/me", response_model=UserResponse)
def get_my_investor_profile(
    current_user: User = Depends(require_retail_user),
    db: Session = Depends(get_db),
) -> User:
    ensure_retail_organization(db, current_user)
    if current_user.role != UserRole.INVESTOR:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Раздел доступен только инвесторам",
        )
    return current_user


@router.patch("/investors/me", response_model=UserResponse)
def update_my_investment(
    payload: RetailInvestorSelfUpdate,
    current_user: User = Depends(require_retail_user),
    db: Session = Depends(get_db),
) -> User:
    ensure_retail_organization(db, current_user)
    if current_user.role != UserRole.INVESTOR:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Раздел доступен только инвесторам",
        )

    old_value = current_user.investment_amount
    if old_value != payload.investment_amount:
        log_audit(
            db,
            user=current_user,
            entity_type="user",
            entity_id=current_user.id,
            action=AuditAction.UPDATE,
            field_name="investment_amount",
            old_value=old_value,
            new_value=payload.investment_amount,
        )
        current_user.investment_amount = payload.investment_amount

    db.commit()
    db.refresh(current_user)
    return current_user


@router.post("/investors", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def create_investor(
    payload: RetailInvestorCreate,
    current_user: User = Depends(require_owner),
    db: Session = Depends(get_db),
) -> User:
    ensure_retail_organization(db, current_user)
    if not payload.email and not payload.phone:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Укажите email или телефон",
        )
    assert_contacts_available(
        db,
        organization_type=OrganizationType.RETAIL,
        email=payload.email,
        phone=payload.phone,
    )
    investor = User(
        organization_id=current_user.organization_id,
        full_name=payload.full_name,
        phone=payload.phone,
        email=payload.email,
        password_hash=get_password_hash(payload.password),
        role=UserRole.INVESTOR,
        is_active=payload.is_active,
        investment_amount=payload.investment_amount,
    )
    db.add(investor)
    db.flush()
    log_audit(
        db,
        user=current_user,
        entity_type="user",
        entity_id=investor.id,
        action=AuditAction.CREATE,
    )
    db.commit()
    db.refresh(investor)
    return investor


def _get_retail_investor(db: Session, *, investor_id: UUID, organization_id: UUID) -> User:
    investor = db.get(User, investor_id)
    if (
        investor is None
        or investor.organization_id != organization_id
        or investor.role != UserRole.INVESTOR
    ):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Инвестор не найден")
    return investor


@router.patch("/investors/{investor_id}", response_model=UserResponse)
def update_investor(
    investor_id: UUID,
    payload: RetailInvestorUpdate,
    current_user: User = Depends(require_owner),
    db: Session = Depends(get_db),
) -> User:
    ensure_retail_organization(db, current_user)
    investor = _get_retail_investor(
        db,
        investor_id=investor_id,
        organization_id=current_user.organization_id,
    )
    for field, value in payload.model_dump(exclude_unset=True).items():
        old_value = getattr(investor, field)
        if old_value != value:
            log_audit(
                db,
                user=current_user,
                entity_type="user",
                entity_id=investor.id,
                action=AuditAction.UPDATE,
                field_name=field,
                old_value=old_value,
                new_value=value,
            )
            setattr(investor, field, value.strip() if isinstance(value, str) else value)
    db.commit()
    db.refresh(investor)
    return investor


@router.delete("/investors/{investor_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_investor(
    investor_id: UUID,
    current_user: User = Depends(require_owner),
    db: Session = Depends(get_db),
) -> None:
    ensure_retail_organization(db, current_user)
    investor = _get_retail_investor(
        db,
        investor_id=investor_id,
        organization_id=current_user.organization_id,
    )

    active_contracts = db.scalar(
        select(func.count()).where(
            RetailContract.investor_id == investor.id,
            RetailContract.is_deleted.is_(False),
        )
    )
    if active_contracts:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Сначала удалите активные договоры инвестора",
        )

    any_contracts = db.scalar(
        select(func.count()).where(RetailContract.investor_id == investor.id)
    )
    log_audit(
        db,
        user=current_user,
        entity_type="user",
        entity_id=investor.id,
        action=AuditAction.DELETE,
        field_name="hard_delete" if not any_contracts else "is_active",
        old_value=investor.full_name,
    )

    if any_contracts:
        investor.is_active = False
    else:
        db.delete(investor)

    db.commit()
