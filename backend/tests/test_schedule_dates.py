from datetime import date
from decimal import Decimal
from types import SimpleNamespace

from app.models.enums import PaymentScheduleStatus
from app.services.schedule_dates import (
    is_schedule_overdue,
    next_schedule_due_date,
    payment_window_end,
    payment_window_start,
    schedule_due_date,
    schedule_overdue_days,
)


def make_schedule(
    *,
    due_date: date,
    planned: str = "10000.00",
    paid: str = "0.00",
    status: PaymentScheduleStatus = PaymentScheduleStatus.PENDING,
    deferred_until: date | None = None,
    overdue_waived: bool = False,
) -> SimpleNamespace:
    return SimpleNamespace(
        due_date=due_date,
        deferred_until=deferred_until,
        planned_amount=Decimal(planned),
        paid_amount=Decimal(paid),
        status=status,
        overdue_waived=overdue_waived,
    )


class TestScheduleDueDate:
    def test_first_month_keeps_contract_day(self):
        assert schedule_due_date(date(2026, 7, 9), 1) == date(2026, 7, 9)

    def test_subsequent_months_use_30th(self):
        start = date(2026, 7, 9)
        assert schedule_due_date(start, 2) == date(2026, 8, 30)
        assert schedule_due_date(start, 3) == date(2026, 9, 30)
        assert next_schedule_due_date(date(2026, 7, 9)) == date(2026, 8, 30)

    def test_february_clamps_to_last_day(self):
        assert schedule_due_date(date(2026, 1, 9), 2) == date(2026, 2, 28)
        assert next_schedule_due_date(date(2026, 1, 30)) == date(2026, 2, 28)


class TestPaymentWindow:
    def test_window_starts_on_25th(self):
        due = date(2026, 7, 15)
        assert payment_window_start(due) == date(2026, 7, 25)

    def test_window_ends_on_last_day_of_month(self):
        due = date(2026, 2, 10)
        assert payment_window_end(due) == date(2026, 2, 28)


class TestOverdueRules:
    def test_not_overdue_before_month_end(self):
        schedule = make_schedule(due_date=date(2026, 7, 15))
        today = date(2026, 7, 16)
        assert is_schedule_overdue(schedule, today) is False
        assert schedule_overdue_days(schedule, today) == 0

    def test_not_overdue_during_payment_window(self):
        schedule = make_schedule(due_date=date(2026, 7, 15))
        today = date(2026, 7, 25)
        assert is_schedule_overdue(schedule, today) is False

    def test_overdue_after_month_end(self):
        schedule = make_schedule(due_date=date(2026, 7, 15))
        today = date(2026, 8, 3)
        assert is_schedule_overdue(schedule, today) is True
        assert schedule_overdue_days(schedule, today) == 3

    def test_paid_schedule_is_not_overdue(self):
        schedule = make_schedule(
            due_date=date(2026, 7, 15),
            paid="10000.00",
            status=PaymentScheduleStatus.PAID,
        )
        assert is_schedule_overdue(schedule, date(2026, 8, 10)) is False

    def test_waived_overdue_is_not_overdue(self):
        schedule = make_schedule(due_date=date(2026, 7, 15), overdue_waived=True)
        assert is_schedule_overdue(schedule, date(2026, 8, 10)) is False
