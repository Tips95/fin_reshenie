"""Операционный дашборд коллектора: ожидания месяца, просрочки, обещания."""

from datetime import date
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.client import Client
from app.models.installment_plan import InstallmentPlan
from app.models.payment import Payment
from app.models.payment_schedule import PaymentSchedule
from app.models.user import User
from app.schemas.collector_dashboard import (
    CollectorDashboard,
    CollectorDueMonthItem,
    CollectorOverduePreviewItem,
    CollectorPromisedTodayItem,
)
from app.services.access import apply_client_visibility_filter
from app.services.dashboard import _resolve_period
from app.services.overdues import clients_overdue_summaries
from app.services.schedule_dates import effective_due_date, schedule_remainder

PREVIEW_LIMIT = 8


def get_collector_dashboard(
    db: Session,
    user: User,
    *,
    month: str | None = None,
) -> CollectorDashboard:
    today = date.today()
    period_month, month_start, month_end, is_current_month = _resolve_period(month, today)

    clients = list(
        db.scalars(apply_client_visibility_filter(select(Client), user)).all()
    )
    if not clients:
        return CollectorDashboard(
            period_month=period_month,
            is_current_month=is_current_month,
            expected_this_month=Decimal("0.00"),
            collected_this_month=Decimal("0.00"),
            overdue_amount=Decimal("0.00"),
            clients_overdue=0,
            promised_today_count=0,
            no_contact_count=0,
        )

    clients_by_id = {client.id: client for client in clients}
    client_ids = list(clients_by_id.keys())

    expected_this_month = Decimal("0.00")
    due_rows: list[CollectorDueMonthItem] = []

    schedule_rows = db.execute(
        select(InstallmentPlan.client_id, PaymentSchedule)
        .join(PaymentSchedule, PaymentSchedule.installment_plan_id == InstallmentPlan.id)
        .where(InstallmentPlan.client_id.in_(client_ids))
    ).all()

    for client_id, schedule in schedule_rows:
        remainder = schedule_remainder(schedule)
        if remainder <= Decimal("0.00"):
            continue
        due = effective_due_date(schedule)
        if month_start <= due <= month_end:
            expected_this_month += remainder
            client = clients_by_id.get(client_id)
            if client is not None:
                due_rows.append(
                    CollectorDueMonthItem(
                        client_id=client.id,
                        full_name=client.full_name,
                        phone=client.phone,
                        due_date=due,
                        month_number=schedule.month_number,
                        remainder=remainder,
                        payment_schedule_id=schedule.id,
                    )
                )

    due_rows.sort(key=lambda item: (item.due_date, item.full_name.lower()))

    collected_this_month = Decimal("0.00")
    payments = db.scalars(
        select(Payment).where(
            Payment.client_id.in_(client_ids),
            Payment.is_deleted.is_(False),
            Payment.payment_date >= month_start,
            Payment.payment_date <= month_end,
        )
    ).all()
    for payment in payments:
        signed = -payment.amount if payment.is_refund else payment.amount
        collected_this_month += signed

    summaries = clients_overdue_summaries(db, client_ids, today=today)
    overdue_amount = sum(
        (item["overdue_amount"] for item in summaries.values()),
        Decimal("0.00"),
    )
    clients_overdue = len(summaries)

    overdue_preview: list[CollectorOverduePreviewItem] = []
    promised_today: list[CollectorPromisedTodayItem] = []
    no_contact_count = 0

    for client_id, summary in summaries.items():
        client = clients_by_id.get(client_id)
        if client is None:
            continue
        if summary["last_call_result"] is None and summary["promised_pay_date"] is None:
            no_contact_count += 1
        overdue_preview.append(
            CollectorOverduePreviewItem(
                client_id=client.id,
                full_name=client.full_name,
                phone=client.phone,
                overdue_amount=summary["overdue_amount"],
                overdue_days=summary["overdue_days"],
                promised_pay_date=summary["promised_pay_date"],
                last_call_result=summary["last_call_result"],
            )
        )
        if summary["promised_pay_date"] == today:
            promised_today.append(
                CollectorPromisedTodayItem(
                    client_id=client.id,
                    full_name=client.full_name,
                    phone=client.phone,
                    overdue_amount=summary["overdue_amount"],
                    promised_pay_date=summary["promised_pay_date"],
                    payment_schedule_id=summary["payment_schedule_id"],
                    manager_note=summary["manager_note"],
                )
            )

    overdue_preview.sort(key=lambda item: (-item.overdue_days, item.full_name.lower()))
    promised_today.sort(key=lambda item: item.full_name.lower())

    return CollectorDashboard(
        period_month=period_month,
        is_current_month=is_current_month,
        expected_this_month=expected_this_month,
        collected_this_month=collected_this_month,
        overdue_amount=overdue_amount,
        clients_overdue=clients_overdue,
        promised_today_count=len(promised_today),
        no_contact_count=no_contact_count,
        due_this_month_preview=due_rows[:PREVIEW_LIMIT],
        overdue_preview=overdue_preview[:PREVIEW_LIMIT],
        promised_today_preview=promised_today[:PREVIEW_LIMIT],
    )
