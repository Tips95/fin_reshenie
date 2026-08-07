from datetime import date
from decimal import Decimal
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload, selectinload

from app.models.enums import RetailContractStatus, RetailPaymentType, UserRole
from app.models.retail_client import RetailClient
from app.models.retail_contract import RetailContract
from app.models.user import User
from app.schemas.retail import InvestorSummaryItem, RetailDashboardSummary
from app.services.retail_access import apply_investor_contract_filter, money
from app.services.retail_contracts import sync_contract_status
from app.services.retail_finances import (
    aggregate_contract_finances,
    contract_collected,
    contract_collected_profit,
    contract_expected_profit,
    contract_purchase_price,
)
from app.services.validation import format_passport_display


def _contract_remainder(contract: RetailContract) -> Decimal:
    schedule_remainder = sum(
        max(item.planned_amount - item.paid_amount, Decimal("0.00"))
        for item in contract.payment_schedule
    )
    down_paid = sum(
        payment.amount
        for payment in contract.payments
        if not payment.is_deleted and payment.payment_type == RetailPaymentType.DOWN_PAYMENT
    )
    down_remainder = max(contract.down_payment - down_paid, Decimal("0.00"))
    return money(Decimal(schedule_remainder) + down_remainder)


def build_contract_brief(contract: RetailContract) -> dict:
    collected = contract_collected(contract)
    remainder = _contract_remainder(contract)
    purchase = contract_purchase_price(contract)
    expected_profit = contract_expected_profit(contract)
    collected_profit = contract_collected_profit(contract, collected)
    markup_amount = money(contract.total_amount - contract.product_price)
    has_overdue = contract.status == RetailContractStatus.OVERDUE
    return {
        "id": contract.id,
        "retail_client_id": contract.retail_client_id,
        "investor_id": contract.investor_id,
        "investor_name": contract.investor.full_name if contract.investor else "—",
        "client_name": contract.client.full_name if contract.client else "—",
        "product_name": contract.product_name,
        "purchase_price": purchase,
        "product_price": contract.product_price,
        "term_months": contract.term_months,
        "markup_percent": contract.markup_percent,
        "total_amount": contract.total_amount,
        "down_payment": contract.down_payment,
        "financed_amount": contract.financed_amount,
        "monthly_payment": contract.monthly_payment,
        "contract_date": contract.contract_date,
        "status": contract.status,
        "collected_total": collected,
        "remainder_total": remainder,
        "expected_profit": expected_profit,
        "collected_profit": collected_profit,
        "markup_amount": markup_amount,
        "has_overdue": has_overdue,
        "has_signed_contract_pdf": bool(contract.signed_contract_pdf_path),
        "signed_contract_pdf_filename": contract.signed_contract_pdf_filename,
    }


def _contracts_for_clients(
    db: Session,
    user: User,
    client_ids: list[UUID],
) -> dict[UUID, list[RetailContract]]:
    if not client_ids:
        return {}
    stmt = (
        select(RetailContract)
        .options(
            joinedload(RetailContract.investor),
            selectinload(RetailContract.payment_schedule),
            selectinload(RetailContract.payments),
        )
        .where(
            RetailContract.organization_id == user.organization_id,
            RetailContract.retail_client_id.in_(client_ids),
            RetailContract.is_deleted.is_(False),
        )
    )
    stmt = apply_investor_contract_filter(stmt, user)
    contracts = list(db.scalars(stmt))
    grouped: dict[UUID, list[RetailContract]] = {client_id: [] for client_id in client_ids}
    for contract in contracts:
        grouped.setdefault(contract.retail_client_id, []).append(contract)
    return grouped


def build_client_response(
    db: Session,
    user: User,
    client: RetailClient,
    contracts: list[RetailContract] | None = None,
) -> dict:
    passport_pdf_path = getattr(client, "passport_pdf_path", None)
    passport_pdf_filename = getattr(client, "passport_pdf_filename", None)
    guarantor_passport_pdf_path = getattr(client, "guarantor_passport_pdf_path", None)
    guarantor_passport_pdf_filename = getattr(client, "guarantor_passport_pdf_filename", None)
    if contracts is None:
        contracts = _contracts_for_clients(db, user, [client.id]).get(client.id, [])
    finances = aggregate_contract_finances(contracts)
    return {
        "id": client.id,
        "organization_id": client.organization_id,
        "full_name": client.full_name,
        "phone": client.phone,
        "passport": format_passport_display(client.passport) if client.passport else None,
        "address": client.address,
        "guarantor_full_name": client.guarantor_full_name,
        "guarantor_phone": client.guarantor_phone,
        "guarantor_passport": (
            format_passport_display(client.guarantor_passport) if client.guarantor_passport else None
        ),
        "contracts_count": len(contracts),
        "purchase_total": finances["purchase_total"],
        "revenue_total": finances["revenue_total"],
        "collected_total": finances["collected_total"],
        "expected_profit": finances["expected_profit"],
        "collected_profit": finances["collected_profit"],
        "remainder_total": finances["remainder_total"],
        "has_passport_pdf": bool(passport_pdf_path),
        "passport_pdf_filename": passport_pdf_filename,
        "has_guarantor_passport_pdf": bool(guarantor_passport_pdf_path),
        "guarantor_passport_pdf_filename": guarantor_passport_pdf_filename,
    }


def get_retail_dashboard(db: Session, user: User) -> RetailDashboardSummary:
    stmt = (
        select(RetailContract)
        .options(
            joinedload(RetailContract.client),
            joinedload(RetailContract.investor),
            selectinload(RetailContract.payment_schedule),
            selectinload(RetailContract.payments),
        )
        .where(
            RetailContract.organization_id == user.organization_id,
            RetailContract.is_deleted.is_(False),
        )
    )
    stmt = apply_investor_contract_filter(stmt, user)
    contracts = list(db.scalars(stmt))

    for contract in contracts:
        sync_contract_status(contract, date.today())

    contracts_count = len(contracts)
    active_count = sum(1 for item in contracts if item.status == RetailContractStatus.ACTIVE)
    overdue_count = sum(1 for item in contracts if item.status == RetailContractStatus.OVERDUE)
    finances = aggregate_contract_finances(contracts)
    down_payment_total = money(sum((item.down_payment for item in contracts), Decimal("0.00")))

    investors: list[InvestorSummaryItem] = []
    if user.role == UserRole.OWNER:
        investor_rows = list(
            db.scalars(
                select(User)
                .where(
                    User.organization_id == user.organization_id,
                    User.role == UserRole.INVESTOR,
                    User.is_active.is_(True),
                )
                .order_by(User.full_name)
            )
        )
        for investor in investor_rows:
            investor_contracts = [item for item in contracts if item.investor_id == investor.id]
            investor_finances = aggregate_contract_finances(investor_contracts)
            investors.append(
                InvestorSummaryItem(
                    investor_id=investor.id,
                    investor_name=investor.full_name,
                    investment_amount=investor.investment_amount or Decimal("0.00"),
                    contracts_count=len(investor_contracts),
                    purchase_total=investor_finances["purchase_total"],
                    total_amount=investor_finances["revenue_total"],
                    collected_total=investor_finances["collected_total"],
                    remainder_total=investor_finances["remainder_total"],
                    expected_profit=investor_finances["expected_profit"],
                    collected_profit=investor_finances["collected_profit"],
                    overdue_count=sum(
                        1 for item in investor_contracts if item.status == RetailContractStatus.OVERDUE
                    ),
                )
            )

    return RetailDashboardSummary(
        contracts_count=contracts_count,
        active_count=active_count,
        overdue_count=overdue_count,
        purchase_total=finances["purchase_total"],
        total_amount=finances["revenue_total"],
        collected_total=finances["collected_total"],
        remainder_total=finances["remainder_total"],
        expected_profit=finances["expected_profit"],
        collected_profit=finances["collected_profit"],
        down_payment_total=down_payment_total,
        investors=investors,
    )


def client_contracts_count(db: Session, user: User, client_id: UUID) -> int:
    stmt = select(func.count()).where(
        RetailContract.retail_client_id == client_id,
        RetailContract.is_deleted.is_(False),
    )
    if user.role == UserRole.INVESTOR:
        stmt = stmt.where(RetailContract.investor_id == user.id)
    return db.scalar(stmt) or 0
