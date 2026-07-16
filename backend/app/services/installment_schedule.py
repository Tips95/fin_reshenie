from datetime import date
from decimal import Decimal

from dateutil.relativedelta import relativedelta
from fastapi import HTTPException, status

from app.models.enums import PaymentScheduleStatus
from app.models.payment_schedule import PaymentSchedule
from app.models.pricing_tier import PricingTier


def _month_due_date(start_date: date, month_number: int) -> date:
    return start_date + relativedelta(months=month_number - 1)


def build_payment_schedule_entries(
    *,
    pricing_tier: PricingTier,
    start_date: date,
) -> list[dict]:
    entries: list[dict] = []
    amounts: list[Decimal] = [
        pricing_tier.first_month_payment,
        pricing_tier.second_month_payment,
    ]
    amounts.extend(
        [pricing_tier.remaining_month_payment] * pricing_tier.remaining_months_count
    )

    if len(amounts) != pricing_tier.total_months:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Количество месяцев в тарифе не совпадает с суммой платежей",
        )

    total = sum(amounts, Decimal("0.00"))
    if total != pricing_tier.total_cost:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Сумма графика ({total}) не равна total_cost тарифа ({pricing_tier.total_cost})",
        )

    for month_number, amount in enumerate(amounts, start=1):
        entries.append(
            {
                "month_number": month_number,
                "due_date": _month_due_date(start_date, month_number),
                "planned_amount": amount,
                "paid_amount": Decimal("0.00"),
                "status": PaymentScheduleStatus.PENDING,
            }
        )

    return entries


def create_payment_schedule_models(
    *,
    pricing_tier: PricingTier,
    start_date: date,
    installment_plan_id,
) -> list[PaymentSchedule]:
    entries = build_payment_schedule_entries(pricing_tier=pricing_tier, start_date=start_date)
    return [
        PaymentSchedule(installment_plan_id=installment_plan_id, **entry)
        for entry in entries
    ]


def apply_payment_to_schedule(schedule: PaymentSchedule, amount: Decimal, payment_date: date) -> None:
    schedule.paid_amount += amount
    if schedule.paid_amount >= schedule.planned_amount:
        schedule.status = PaymentScheduleStatus.PAID
        schedule.paid_date = payment_date
        schedule.paid_amount = schedule.planned_amount
    elif schedule.paid_amount > Decimal("0.00"):
        schedule.status = PaymentScheduleStatus.PARTIAL
    else:
        schedule.status = PaymentScheduleStatus.PENDING
        schedule.paid_date = None


def recalculate_schedule_from_payments(
    schedule: PaymentSchedule,
    payments: list,
) -> None:
    """Пересчитывает строку графика по всем активным платежам и возвратам."""
    net = Decimal("0.00")
    completion_date = None

    sorted_payments = sorted(payments, key=lambda item: (item.payment_date, item.created_at))
    for payment in sorted_payments:
        if payment.is_refund:
            net -= payment.amount
        else:
            previous = net
            net += payment.amount
            if previous < schedule.planned_amount <= net:
                completion_date = payment.payment_date

    net = max(Decimal("0.00"), net)
    if net > schedule.planned_amount:
        net = schedule.planned_amount

    schedule.paid_amount = net
    if net >= schedule.planned_amount:
        schedule.status = PaymentScheduleStatus.PAID
        schedule.paid_date = completion_date
    elif net > Decimal("0.00"):
        schedule.status = PaymentScheduleStatus.PARTIAL
        schedule.paid_date = None
    else:
        schedule.status = PaymentScheduleStatus.PENDING
        schedule.paid_date = None
