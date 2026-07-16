from calendar import monthrange
from datetime import date
from decimal import Decimal

from dateutil.relativedelta import relativedelta
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.enums import PaymentScheduleStatus, RetailContractStatus, UserRole
from app.models.retail_contract import RetailContract, RetailPaymentSchedule
from app.models.user import User
from app.services.retail_access import (
    ensure_contract_access,
    get_organization_investor,
    get_retail_client,
    money,
)
from app.services.retail_term_rates import get_markup_percent


def add_months(base: date, months: int) -> date:
    target = base + relativedelta(months=months)
    _, last_day = monthrange(target.year, target.month)
    day = min(base.day, last_day)
    return date(target.year, target.month, day)


def calculate_contract_amounts(
    *,
    product_price: Decimal,
    term_months: int,
    markup_percent: Decimal,
    down_payment: Decimal,
) -> tuple[Decimal, Decimal, Decimal, Decimal]:
    if term_months < 6 or term_months > 12:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Срок рассрочки должен быть от 6 до 12 месяцев",
        )
    if down_payment < Decimal("0.00"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Первоначальный взнос не может быть отрицательным",
        )

    total_amount = money(product_price * (Decimal("1.00") + markup_percent / Decimal("100")))
    if down_payment > total_amount:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Первоначальный взнос не может превышать итоговую сумму",
        )

    financed_amount = money(total_amount - down_payment)
    if financed_amount <= Decimal("0.00"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Сумма в рассрочку должна быть больше нуля",
        )

    monthly_payment = money(financed_amount / Decimal(term_months))
    schedule_total = money(monthly_payment * Decimal(term_months))
    remainder = money(financed_amount - schedule_total)
    if remainder != Decimal("0.00"):
        monthly_payment = money(monthly_payment + remainder / Decimal(term_months))

    return total_amount, financed_amount, monthly_payment, schedule_total


def build_payment_schedule(
    *,
    contract: RetailContract,
    monthly_payment: Decimal,
    financed_amount: Decimal,
) -> list[RetailPaymentSchedule]:
    entries: list[RetailPaymentSchedule] = []
    allocated = Decimal("0.00")
    for month_number in range(1, contract.term_months + 1):
        if month_number == contract.term_months:
            planned_amount = money(financed_amount - allocated)
        else:
            planned_amount = monthly_payment
            allocated += planned_amount
        entries.append(
            RetailPaymentSchedule(
                retail_contract_id=contract.id,
                month_number=month_number,
                due_date=add_months(contract.contract_date, month_number),
                planned_amount=planned_amount,
                paid_amount=Decimal("0.00"),
                status=PaymentScheduleStatus.PENDING,
            )
        )
    return entries


def create_retail_contract(
    db: Session,
    user: User,
    *,
    retail_client_id,
    investor_id,
    product_name: str,
    product_price: Decimal,
    term_months: int,
    down_payment: Decimal,
    contract_date: date,
) -> RetailContract:
    if user.role not in (UserRole.OWNER,):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Создавать договоры может только администратор",
        )

    get_retail_client(db, client_id=retail_client_id, organization_id=user.organization_id)
    investor = get_organization_investor(
        db,
        investor_id=investor_id,
        organization_id=user.organization_id,
    )

    markup_percent = get_markup_percent(db, user.organization_id, term_months)
    total_amount, financed_amount, monthly_payment, _ = calculate_contract_amounts(
        product_price=product_price,
        term_months=term_months,
        markup_percent=markup_percent,
        down_payment=down_payment,
    )

    contract = RetailContract(
        organization_id=user.organization_id,
        retail_client_id=retail_client_id,
        investor_id=investor.id,
        created_by_id=user.id,
        product_name=product_name.strip(),
        product_price=money(product_price),
        term_months=term_months,
        markup_percent=markup_percent,
        total_amount=total_amount,
        down_payment=money(down_payment),
        financed_amount=financed_amount,
        monthly_payment=monthly_payment,
        contract_date=contract_date,
        status=RetailContractStatus.ACTIVE,
    )
    db.add(contract)
    db.flush()

    schedule = build_payment_schedule(
        contract=contract,
        monthly_payment=monthly_payment,
        financed_amount=financed_amount,
    )
    db.add_all(schedule)
    return contract


def sync_contract_status(contract: RetailContract, today: date | None = None) -> None:
    current_day = today or date.today()
    has_overdue = False
    all_paid = True

    for item in contract.payment_schedule:
        remainder = item.planned_amount - item.paid_amount
        if remainder > Decimal("0.00"):
            all_paid = False
            if item.due_date < current_day:
                has_overdue = True
                item.status = PaymentScheduleStatus.OVERDUE
            elif item.paid_amount > Decimal("0.00"):
                item.status = PaymentScheduleStatus.PARTIAL
            else:
                item.status = PaymentScheduleStatus.PENDING
        else:
            item.status = PaymentScheduleStatus.PAID

    if contract.status == RetailContractStatus.CANCELLED:
        return
    if all_paid:
        contract.status = RetailContractStatus.COMPLETED
    elif has_overdue:
        contract.status = RetailContractStatus.OVERDUE
    else:
        contract.status = RetailContractStatus.ACTIVE
