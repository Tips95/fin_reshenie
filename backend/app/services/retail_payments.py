from datetime import date
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.enums import PaymentScheduleStatus, RetailContractStatus, RetailPaymentType, UserRole
from app.models.retail_contract import RetailPaymentSchedule
from app.models.retail_payment import RetailPayment
from app.models.user import User
from app.services.retail_access import ensure_contract_access, get_retail_contract, money
from app.services.retail_contracts import sync_contract_status


def apply_payment_to_schedule(schedule: RetailPaymentSchedule, amount: Decimal, payment_date: date) -> None:
    remainder = schedule.planned_amount - schedule.paid_amount
    if amount > remainder:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Сумма превышает остаток по месяцу графика",
        )
    schedule.paid_amount = money(schedule.paid_amount + amount)
    if schedule.paid_amount >= schedule.planned_amount:
        schedule.status = PaymentScheduleStatus.PAID
        schedule.paid_date = payment_date
    elif schedule.paid_amount > Decimal("0.00"):
        schedule.status = PaymentScheduleStatus.PARTIAL


def record_retail_payment(
    db: Session,
    user: User,
    *,
    contract_id,
    amount: Decimal,
    payment_date: date,
    payment_type: RetailPaymentType,
    payment_schedule_id=None,
    comment: str | None = None,
) -> RetailPayment:
    contract = get_retail_contract(db, contract_id=contract_id, organization_id=user.organization_id)
    ensure_contract_access(db, user, contract)

    if user.role == UserRole.INVESTOR and contract.investor_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Нет доступа к договору")

    if amount <= Decimal("0.00"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Сумма платежа должна быть больше нуля",
        )

    schedule = None
    if payment_type == RetailPaymentType.DOWN_PAYMENT:
        existing_down = sum(
            payment.amount
            for payment in contract.payments
            if not payment.is_deleted and payment.payment_type == RetailPaymentType.DOWN_PAYMENT
        )
        if existing_down >= contract.down_payment:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Первоначальный взнос уже полностью зафиксирован",
            )
        remainder = money(contract.down_payment - existing_down)
        if amount > remainder:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Сумма превышает остаток первоначального взноса",
            )
    elif payment_type == RetailPaymentType.MONTHLY:
        if payment_schedule_id is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Укажите месяц графика",
            )
        schedule = next(
            (item for item in contract.payment_schedule if item.id == payment_schedule_id),
            None,
        )
        if schedule is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Месяц графика не найден")
        apply_payment_to_schedule(schedule, amount, payment_date)
    elif payment_type == RetailPaymentType.EARLY_REPAYMENT:
        financed_paid = sum(
            payment.amount
            for payment in contract.payments
            if not payment.is_deleted
            and payment.payment_type in (RetailPaymentType.MONTHLY, RetailPaymentType.EARLY_REPAYMENT)
        )
        schedule_paid = sum(item.paid_amount for item in contract.payment_schedule)
        outstanding = money(contract.financed_amount - max(financed_paid, schedule_paid))
        if amount > outstanding:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Сумма превышает остаток по рассрочке",
            )

    payment = RetailPayment(
        organization_id=user.organization_id,
        retail_contract_id=contract.id,
        payment_schedule_id=schedule.id if schedule else None,
        payment_type=payment_type,
        amount=money(amount),
        payment_date=payment_date,
        comment=comment,
        created_by_id=user.id,
    )
    db.add(payment)

    if payment_type == RetailPaymentType.EARLY_REPAYMENT:
        remaining = amount
        for item in sorted(contract.payment_schedule, key=lambda row: row.month_number):
            if remaining <= Decimal("0.00"):
                break
            item_remainder = money(item.planned_amount - item.paid_amount)
            if item_remainder <= Decimal("0.00"):
                continue
            applied = min(item_remainder, remaining)
            apply_payment_to_schedule(item, applied, payment_date)
            remaining = money(remaining - applied)

    sync_contract_status(contract)
    return payment
