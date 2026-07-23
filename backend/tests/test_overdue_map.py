import uuid
from datetime import date, timedelta
from decimal import Decimal
from types import SimpleNamespace

from app.models.enums import PaymentScheduleStatus
from app.services.access import client_has_overdue_payments, clients_overdue_map


CLIENT_A = uuid.UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
CLIENT_B = uuid.UUID("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb")
PLAN_A = uuid.UUID("cccccccc-cccc-cccc-cccc-cccccccccccc")


def make_schedule(
    *,
    status: PaymentScheduleStatus = PaymentScheduleStatus.PENDING,
    planned: str = "10000.00",
    paid: str = "0.00",
    due_date: date | None = None,
    overdue_waived: bool = False,
) -> SimpleNamespace:
    return SimpleNamespace(
        planned_amount=Decimal(planned),
        paid_amount=Decimal(paid),
        due_date=due_date or date.today() - timedelta(days=40),
        deferred_until=None,
        status=status,
        overdue_waived=overdue_waived,
    )


class TestClientsOverdueMap:
    def test_marks_client_with_overdue_schedule(self):
        overdue_schedule = make_schedule()
        rows = [(CLIENT_A, overdue_schedule)]
        db = SimpleNamespace(
            execute=lambda *_args, **_kwargs: rows,
        )

        result = clients_overdue_map(db, [CLIENT_A, CLIENT_B], today=date.today())

        assert result[CLIENT_A] is True
        assert result[CLIENT_B] is False

    def test_single_client_wrapper_uses_batch_map(self):
        overdue_schedule = make_schedule()
        db = SimpleNamespace(
            execute=lambda *_args, **_kwargs: [(CLIENT_A, overdue_schedule)],
        )

        assert client_has_overdue_payments(db, CLIENT_A) is True

    def test_paid_schedule_is_not_overdue(self):
        paid_schedule = make_schedule(
            status=PaymentScheduleStatus.PAID,
            paid="10000.00",
        )
        db = SimpleNamespace(
            execute=lambda *_args, **_kwargs: [(CLIENT_A, paid_schedule)],
        )

        result = clients_overdue_map(db, [CLIENT_A], today=date.today())

        assert result[CLIENT_A] is False
