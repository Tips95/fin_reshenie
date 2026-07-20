from decimal import Decimal

from dateutil.relativedelta import relativedelta
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.enums import PaymentScheduleStatus
from app.models.installment_plan import InstallmentPlan
from app.models.payment_schedule import PaymentSchedule


def _schedule_planned_total(schedules: list[PaymentSchedule]) -> Decimal:
    return sum((item.planned_amount for item in schedules), Decimal("0.00"))


def update_installment_plan_total_amount(
    db: Session,
    plan: InstallmentPlan,
    *,
    new_total: Decimal,
) -> InstallmentPlan:
    if new_total <= Decimal("0.00"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Сумма договора должна быть больше нуля",
        )

    schedules = list(
        db.scalars(
            select(PaymentSchedule)
            .where(PaymentSchedule.installment_plan_id == plan.id)
            .order_by(PaymentSchedule.month_number)
        )
    )
    if not schedules:
        plan.total_amount = new_total
        return plan

    planned_total = _schedule_planned_total(schedules)
    delta = new_total - planned_total
    if delta == Decimal("0.00"):
        plan.total_amount = new_total
        return plan

    adjustable = [
        item
        for item in schedules
        if item.status in {
            PaymentScheduleStatus.PENDING,
            PaymentScheduleStatus.PARTIAL,
            PaymentScheduleStatus.OVERDUE,
        }
    ]
    if adjustable:
        target = adjustable[-1]
        target.planned_amount += delta
        if target.planned_amount < target.paid_amount:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Сумма договора не может быть меньше уже оплаченного по графику",
            )
        if target.paid_amount >= target.planned_amount and target.planned_amount > Decimal("0.00"):
            target.status = PaymentScheduleStatus.PAID
        elif target.paid_amount > Decimal("0.00"):
            target.status = PaymentScheduleStatus.PARTIAL
        else:
            target.status = PaymentScheduleStatus.PENDING
            target.paid_date = None
    else:
        last = schedules[-1]
        due_date = last.due_date + relativedelta(months=1)
        schedules.append(
            PaymentSchedule(
                installment_plan_id=plan.id,
                month_number=last.month_number + 1,
                due_date=due_date,
                planned_amount=delta,
                paid_amount=Decimal("0.00"),
                status=PaymentScheduleStatus.PENDING,
            )
        )
        plan.total_months = last.month_number + 1
        db.add(schedules[-1])

    plan.total_amount = new_total
    return plan
