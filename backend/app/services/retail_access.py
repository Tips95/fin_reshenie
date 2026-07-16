from decimal import Decimal, ROUND_HALF_UP
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.models.enums import OrganizationType, PaymentScheduleStatus, RetailContractStatus, UserRole
from app.models.organization import Organization
from app.models.retail_client import RetailClient
from app.models.retail_contract import RetailContract
from app.models.user import User


def ensure_retail_organization(db: Session, user: User) -> Organization:
    organization = db.get(Organization, user.organization_id)
    if organization is None or organization.organization_type != OrganizationType.RETAIL:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Раздел доступен только для товарной рассрочки",
        )
    return organization


def get_retail_client(
    db: Session,
    *,
    client_id: UUID,
    organization_id: UUID,
) -> RetailClient:
    client = db.scalar(
        select(RetailClient).where(
            RetailClient.id == client_id,
            RetailClient.organization_id == organization_id,
            RetailClient.is_deleted.is_(False),
        )
    )
    if client is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Клиент не найден")
    return client


def get_retail_contract(
    db: Session,
    *,
    contract_id: UUID,
    organization_id: UUID,
) -> RetailContract:
    contract = db.scalar(
        select(RetailContract)
        .options(
            joinedload(RetailContract.client),
            joinedload(RetailContract.investor),
            joinedload(RetailContract.payment_schedule),
            joinedload(RetailContract.payments),
            joinedload(RetailContract.overdue_logs),
        )
        .where(
            RetailContract.id == contract_id,
            RetailContract.organization_id == organization_id,
            RetailContract.is_deleted.is_(False),
        )
    )
    if contract is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Договор не найден")
    return contract


def ensure_contract_access(db: Session, user: User, contract: RetailContract) -> RetailContract:
    ensure_retail_organization(db, user)
    if user.role == UserRole.INVESTOR and contract.investor_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Нет доступа к договору")
    return contract


def apply_investor_contract_filter(stmt, user: User):
    if user.role == UserRole.INVESTOR:
        return stmt.where(RetailContract.investor_id == user.id)
    return stmt


def get_organization_investor(
    db: Session,
    *,
    investor_id: UUID,
    organization_id: UUID,
) -> User:
    investor = db.scalar(
        select(User).where(
            User.id == investor_id,
            User.organization_id == organization_id,
            User.role == UserRole.INVESTOR,
            User.is_active.is_(True),
        )
    )
    if investor is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Инвестор не найден")
    return investor


def money(value: Decimal | int | float | str) -> Decimal:
    if not isinstance(value, Decimal):
        value = Decimal(str(value))
    return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
