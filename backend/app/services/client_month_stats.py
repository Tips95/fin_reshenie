from collections import defaultdict
from decimal import Decimal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.installment_plan import InstallmentPlan
from app.models.payment import Payment
from app.models.payment_schedule import PaymentSchedule
from app.schemas.client import ClientDueMonthSummary, ClientMonthDueStats
from app.services.phone import month_bounds
from app.services.schedule_dates import schedule_remainder


def _payment_signed(amount: Decimal, is_refund: bool) -> Decimal:
    return -amount if is_refund else amount


def _effective_due(schedule: PaymentSchedule):
    return schedule.deferred_until or schedule.due_date


def compute_due_month_stats(
    db: Session,
    client_ids: list[UUID],
    due_month: str,
) -> tuple[ClientDueMonthSummary, dict[UUID, ClientMonthDueStats]]:
    start, end = month_bounds(due_month)
    empty_summary = ClientDueMonthSummary(
        month=due_month,
        clients_count=0,
        planned_total=Decimal("0.00"),
        remainder_total=Decimal("0.00"),
        collected_total=Decimal("0.00"),
        paid_due_count=0,
        unpaid_due_count=0,
        payments_remaining_total=0,
    )
    if not client_ids:
        return empty_summary, {}

    plans = list(
        db.scalars(select(InstallmentPlan).where(InstallmentPlan.client_id.in_(client_ids)))
    )
    plan_ids = [plan.id for plan in plans]
    plan_by_client = {plan.client_id: plan for plan in plans}

    schedules_by_client: dict[UUID, list[PaymentSchedule]] = defaultdict(list)
    if plan_ids:
        plan_client_map = {plan.id: plan.client_id for plan in plans}
        schedules = list(
            db.scalars(
                select(PaymentSchedule).where(PaymentSchedule.installment_plan_id.in_(plan_ids))
            )
        )
        for schedule in schedules:
            client_id = plan_client_map[schedule.installment_plan_id]
            schedules_by_client[client_id].append(schedule)

    payments = list(
        db.scalars(
            select(Payment).where(
                Payment.client_id.in_(client_ids),
                Payment.is_deleted.is_(False),
                Payment.payment_date >= start,
                Payment.payment_date <= end,
            )
        )
    )
    collected_total = sum(
        (_payment_signed(payment.amount, payment.is_refund) for payment in payments),
        Decimal("0.00"),
    )

    per_client: dict[UUID, ClientMonthDueStats] = {}
    planned_total = Decimal("0.00")
    remainder_total = Decimal("0.00")
    paid_due_count = 0
    unpaid_due_count = 0
    payments_remaining_total = 0

    for client_id in client_ids:
        schedules = schedules_by_client.get(client_id, [])
        due_rows = [
            row
            for row in schedules
            if start <= _effective_due(row) <= end
        ]
        if not due_rows:
            continue

        month_planned = sum((row.planned_amount for row in due_rows), Decimal("0.00"))
        month_paid = sum((row.paid_amount for row in due_rows), Decimal("0.00"))
        month_remainder = sum((schedule_remainder(row) for row in due_rows), Decimal("0.00"))
        remaining_rows = sum(1 for row in schedules if schedule_remainder(row) > Decimal("0.00"))

        planned_total += month_planned
        remainder_total += month_remainder
        payments_remaining_total += remaining_rows

        for row in due_rows:
            if schedule_remainder(row) <= Decimal("0.00"):
                paid_due_count += 1
            else:
                unpaid_due_count += 1

        per_client[client_id] = ClientMonthDueStats(
            planned_amount=month_planned,
            paid_amount=month_paid,
            remainder=month_remainder,
            payments_remaining=remaining_rows,
        )

    summary = ClientDueMonthSummary(
        month=due_month,
        clients_count=len(client_ids),
        planned_total=planned_total,
        remainder_total=remainder_total,
        collected_total=collected_total,
        paid_due_count=paid_due_count,
        unpaid_due_count=unpaid_due_count,
        payments_remaining_total=payments_remaining_total,
    )
    return summary, per_client
