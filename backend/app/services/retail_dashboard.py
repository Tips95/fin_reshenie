from datetime import date
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.models.enums import RetailContractStatus, RetailPaymentType, UserRole
from app.models.retail_contract import RetailContract
from app.models.retail_payment import RetailPayment
from app.models.user import User
from app.schemas.retail import InvestorSummaryItem, RetailDashboardSummary
from app.services.retail_access import apply_investor_contract_filter, money
from app.services.retail_contracts import sync_contract_status


def _contract_collected(contract: RetailContract) -> Decimal:
    return money(
        sum(
            payment.amount
            for payment in contract.payments
            if not payment.is_deleted
        )
    )


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
    collected = _contract_collected(contract)
    remainder = _contract_remainder(contract)
    has_overdue = contract.status == RetailContractStatus.OVERDUE
    return {
        "id": contract.id,
        "retail_client_id": contract.retail_client_id,
        "investor_id": contract.investor_id,
        "investor_name": contract.investor.full_name if contract.investor else "—",
        "client_name": contract.client.full_name if contract.client else "—",
        "product_name": contract.product_name,
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
        "has_overdue": has_overdue,
    }


def get_retail_dashboard(db: Session, user: User) -> RetailDashboardSummary:
    stmt = (
        select(RetailContract)
        .options(
            joinedload(RetailContract.client),
            joinedload(RetailContract.investor),
            joinedload(RetailContract.payment_schedule),
            joinedload(RetailContract.payments),
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
    zero = Decimal("0.00")
    total_amount = money(sum((item.total_amount for item in contracts), zero))
    collected_total = money(sum((_contract_collected(item) for item in contracts), zero))
    remainder_total = money(sum((_contract_remainder(item) for item in contracts), zero))
    down_payment_total = money(sum((item.down_payment for item in contracts), zero))

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
            investors.append(
                InvestorSummaryItem(
                    investor_id=investor.id,
                    investor_name=investor.full_name,
                    contracts_count=len(investor_contracts),
                    total_amount=money(sum((item.total_amount for item in investor_contracts), zero)),
                    collected_total=money(sum((_contract_collected(item) for item in investor_contracts), zero)),
                    remainder_total=money(sum((_contract_remainder(item) for item in investor_contracts), zero)),
                    overdue_count=sum(
                        1 for item in investor_contracts if item.status == RetailContractStatus.OVERDUE
                    ),
                )
            )

    return RetailDashboardSummary(
        contracts_count=contracts_count,
        active_count=active_count,
        overdue_count=overdue_count,
        total_amount=total_amount,
        collected_total=collected_total,
        remainder_total=remainder_total,
        down_payment_total=down_payment_total,
        investors=investors,
    )
