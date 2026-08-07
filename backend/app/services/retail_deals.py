from datetime import date
from decimal import Decimal
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.enums import UserRole
from app.models.retail_client import RetailClient
from app.models.user import User
from app.schemas.retail import RetailDealCreate
from app.services.retail_contracts import create_retail_contract


def resolve_investor_id(user: User, investor_id: UUID | None) -> UUID:
    if user.role == UserRole.INVESTOR:
        return user.id
    if investor_id is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Выберите инвестора",
        )
    return investor_id


def create_retail_client(
    db: Session,
    user: User,
    *,
    full_name: str,
    phone: str,
    passport: str | None = None,
    address: str | None = None,
    guarantor_full_name: str | None = None,
    guarantor_phone: str | None = None,
    guarantor_passport: str | None = None,
) -> RetailClient:
    client = RetailClient(
        organization_id=user.organization_id,
        full_name=full_name.strip(),
        phone=phone.strip(),
        passport=passport,
        address=address,
        guarantor_full_name=guarantor_full_name,
        guarantor_phone=guarantor_phone,
        guarantor_passport=guarantor_passport,
    )
    db.add(client)
    db.flush()
    return client


def create_retail_deal(
    db: Session,
    user: User,
    payload: RetailDealCreate,
) -> tuple[RetailClient, object]:
    investor_id = resolve_investor_id(user, payload.investor_id)
    client = create_retail_client(
        db,
        user,
        full_name=payload.full_name,
        phone=payload.phone,
        passport=payload.passport,
        address=payload.address,
    )
    contract = create_retail_contract(
        db,
        user,
        retail_client_id=client.id,
        investor_id=investor_id,
        product_name=payload.product_name,
        purchase_price=payload.purchase_price,
        product_price=payload.product_price,
        term_months=payload.term_months,
        down_payment=payload.down_payment,
        contract_date=payload.contract_date,
    )
    return client, contract
