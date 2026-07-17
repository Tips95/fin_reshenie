from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.api.deps import get_current_active_user, require_owner, require_roles
from app.core.database import get_db
from app.core.security import get_password_hash
from app.models.enums import AuditAction, RetailContractStatus, UserRole
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
from app.schemas.user import RetailInvestorCreate, RetailInvestorUpdate, UserResponse
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
from app.services.retail_payments import cancel_retail_payment, record_retail_payment
from app.models.retail_term_rate import RetailTermRate

router = APIRouter()
require_retail_user = require_roles(UserRole.OWNER, UserRole.INVESTOR)


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
    result: list[RetailClientResponse] = []
    for client in clients:
        item = RetailClientResponse.model_validate(client)
        item.contracts_count = _client_contracts_count(db, current_user, client.id)
        result.append(item)
    return result


@router.post("/clients", response_model=RetailClientResponse, status_code=status.HTTP_201_CREATED)
def create_client(
    payload: RetailClientCreate,
    current_user: User = Depends(require_owner),
    db: Session = Depends(get_db),
) -> RetailClientResponse:
    ensure_retail_organization(db, current_user)
    client = RetailClient(
        organization_id=current_user.organization_id,
        full_name=payload.full_name.strip(),
        phone=payload.phone.strip(),
        passport=payload.passport.strip(),
        address=payload.address.strip(),
        guarantor_full_name=payload.guarantor_full_name.strip(),
        guarantor_phone=payload.guarantor_phone.strip(),
        guarantor_passport=payload.guarantor_passport.strip(),
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
    return RetailClientResponse.model_validate(client)


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
    item = RetailClientResponse.model_validate(client)
    item.contracts_count = _client_contracts_count(db, current_user, client.id)
    return item


@router.patch("/clients/{client_id}", response_model=RetailClientResponse)
def update_client(
    client_id: UUID,
    payload: RetailClientUpdate,
    current_user: User = Depends(require_owner),
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
    return RetailClientResponse.model_validate(client)


@router.get("/contracts", response_model=list[RetailContractBrief])
def list_contracts(
    status_filter: RetailContractStatus | None = None,
    current_user: User = Depends(require_retail_user),
    db: Session = Depends(get_db),
) -> list[RetailContractBrief]:
    ensure_retail_organization(db, current_user)
    stmt = (
        select(RetailContract)
        .options(
            joinedload(RetailContract.client),
            joinedload(RetailContract.investor),
            joinedload(RetailContract.payment_schedule),
            joinedload(RetailContract.payments),
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
    current_user: User = Depends(require_owner),
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
    current_user: User = Depends(require_owner),
    db: Session = Depends(get_db),
) -> list[User]:
    ensure_retail_organization(db, current_user)
    return list(
        db.scalars(
            select(User)
            .where(
                User.organization_id == current_user.organization_id,
                User.role == UserRole.INVESTOR,
            )
            .order_by(User.full_name)
        )
    )


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
