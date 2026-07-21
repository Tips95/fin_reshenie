from calendar import monthrange
from datetime import date
from decimal import Decimal

from app.models.enums import PaymentScheduleStatus
from app.models.payment_schedule import PaymentSchedule

PAYMENT_WINDOW_START_DAY = 25


def effective_due_date(schedule: PaymentSchedule) -> date:
    return schedule.deferred_until or schedule.due_date


def schedule_month_key(value: date) -> tuple[int, int]:
    return value.year, value.month


def find_schedule_by_payment_month(
    schedules: list[PaymentSchedule],
    payment_date: date,
) -> PaymentSchedule | None:
    target = schedule_month_key(payment_date)
    for schedule in schedules:
        if schedule_month_key(effective_due_date(schedule)) == target:
            return schedule
    return None


def payment_window_start(due: date) -> date:
    return date(due.year, due.month, PAYMENT_WINDOW_START_DAY)


def payment_window_end(due: date) -> date:
    _, last_day = monthrange(due.year, due.month)
    return date(due.year, due.month, last_day)


def schedule_remainder(schedule: PaymentSchedule) -> Decimal:
    diff = schedule.planned_amount - schedule.paid_amount
    return diff if diff > Decimal("0.00") else Decimal("0.00")


def is_schedule_overdue(schedule: PaymentSchedule, today: date) -> bool:
    if schedule.overdue_waived:
        return False
    if schedule_remainder(schedule) <= Decimal("0.00"):
        return False

    due = effective_due_date(schedule)
    grace_end = payment_window_end(due)
    if today <= grace_end:
        return False

    if schedule.status == PaymentScheduleStatus.OVERDUE:
        return True
    if schedule.status in (PaymentScheduleStatus.PENDING, PaymentScheduleStatus.PARTIAL):
        return True
    return False


def schedule_overdue_days(schedule: PaymentSchedule, today: date) -> int:
    if not is_schedule_overdue(schedule, today):
        return 0
    grace_end = payment_window_end(effective_due_date(schedule))
    return max((today - grace_end).days, 1)
