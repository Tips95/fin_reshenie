from datetime import date
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.enums import PaymentScheduleStatus
from app.models.payment_schedule import PaymentSchedule
from app.services.schedule_dates import is_schedule_overdue


def refresh_overdue_statuses(db: Session, installment_plan_id) -> None:
    """Помечает просроченными неоплаченные платежи после окна оплаты (25 — конец месяца)."""
    today = date.today()
    schedules = list(
        db.scalars(
            select(PaymentSchedule).where(
                PaymentSchedule.installment_plan_id == installment_plan_id,
                PaymentSchedule.status.in_(
                    [PaymentScheduleStatus.PENDING, PaymentScheduleStatus.PARTIAL]
                ),
            )
        )
    )
    for item in schedules:
        if item.overdue_waived:
            if item.status == PaymentScheduleStatus.OVERDUE:
                if item.paid_amount > Decimal("0.00"):
                    item.status = PaymentScheduleStatus.PARTIAL
                else:
                    item.status = PaymentScheduleStatus.PENDING
            continue
        if is_schedule_overdue(item, today):
            item.status = PaymentScheduleStatus.OVERDUE


def remaining_amount(planned: Decimal, paid: Decimal) -> Decimal:
    diff = planned - paid
    return diff if diff > Decimal("0.00") else Decimal("0.00")
