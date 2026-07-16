from calendar import monthrange
from collections import defaultdict
from datetime import date
from decimal import Decimal
from uuid import UUID

from dateutil.relativedelta import relativedelta
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.client import Client
from app.models.client_mandatory_payment import ClientMandatoryPayment
from app.models.enums import UserRole
from app.models.installment_plan import InstallmentPlan
from app.models.payment import Payment
from app.models.payment_schedule import PaymentSchedule
from app.models.user import User
from app.schemas.analytics import (
    AnalyticsOverview,
    AnalyticsSummary,
    ClientProfitItem,
    MonthlyTrendPoint,
)
from app.services.access import apply_client_visibility_filter, client_has_overdue_payments
from app.services.dashboard import _monthly_expenses_total, _schedule_remainder


def _payment_signed(amount: Decimal, is_refund: bool) -> Decimal:
    return -amount if is_refund else amount


def _month_periods(months: int, today: date | None = None) -> list[tuple[str, date, date]]:
    anchor = (today or date.today()).replace(day=1)
    periods: list[tuple[str, date, date]] = []
    for offset in range(months - 1, -1, -1):
        current = anchor - relativedelta(months=offset)
        _, last_day = monthrange(current.year, current.month)
        periods.append(
            (
                f"{current.year:04d}-{current.month:02d}",
                current,
                current.replace(day=last_day),
            )
        )
    return periods


def _visible_clients(db: Session, user: User) -> list[Client]:
    stmt = select(Client).where(Client.is_deleted.is_(False))
    stmt = apply_client_visibility_filter(stmt, user)
    return list(db.scalars(stmt))


def _build_client_metrics(
    db: Session,
    clients: list[Client],
    payments_by_client: dict[UUID, list[Payment]],
    mandatory_by_client: dict[UUID, list[ClientMandatoryPayment]],
    schedule_by_client: dict[UUID, list[PaymentSchedule]],
    plan_total_by_client: dict[UUID, Decimal],
) -> list[ClientProfitItem]:
    items: list[ClientProfitItem] = []

    for client in clients:
        payments = payments_by_client.get(client.id, [])
        mandatory = mandatory_by_client.get(client.id, [])
        schedules = schedule_by_client.get(client.id, [])

        collected_total = sum(
            (_payment_signed(payment.amount, payment.is_refund) for payment in payments),
            Decimal("0.00"),
        )
        mandatory_paid_total = sum(
            (item.paid_amount for item in mandatory if item.is_applicable),
            Decimal("0.00"),
        )
        mandatory_remainder = sum(
            (
                _schedule_remainder(item.planned_amount, item.paid_amount)
                for item in mandatory
                if item.is_applicable
            ),
            Decimal("0.00"),
        )
        schedule_remainder = sum(
            (_schedule_remainder(item.planned_amount, item.paid_amount) for item in schedules),
            Decimal("0.00"),
        )
        profit = collected_total - mandatory_paid_total

        items.append(
            ClientProfitItem(
                client_id=client.id,
                full_name=client.full_name,
                contract_date=client.contract_date,
                status=client.status,
                debt_amount=client.debt_amount,
                installment_total=plan_total_by_client.get(client.id),
                collected_total=collected_total,
                mandatory_paid_total=mandatory_paid_total,
                profit=profit,
                schedule_remainder=schedule_remainder,
                mandatory_remainder=mandatory_remainder,
                has_overdue=client_has_overdue_payments(db, client.id),
            )
        )

    items.sort(key=lambda item: item.profit, reverse=True)
    return items


def get_analytics_overview(db: Session, user: User, *, months: int = 6) -> AnalyticsOverview:
    if user.role == UserRole.CALL_CENTER:
        return AnalyticsOverview(
            summary=AnalyticsSummary(
                clients_count=0,
                collected_total=Decimal("0.00"),
                profit_total=Decimal("0.00"),
                schedule_remainder_total=Decimal("0.00"),
                monthly_expenses=Decimal("0.00"),
            ),
            trends=[],
            client_profits=[],
        )

    months = max(1, min(months, 24))
    clients = _visible_clients(db, user)
    client_ids = [client.id for client in clients]

    payments_by_client: dict[UUID, list[Payment]] = defaultdict(list)
    mandatory_by_client: dict[UUID, list[ClientMandatoryPayment]] = defaultdict(list)
    schedule_by_client: dict[UUID, list[PaymentSchedule]] = defaultdict(list)
    plan_total_by_client: dict[UUID, Decimal] = {}

    if client_ids:
        payments = list(
            db.scalars(
                select(Payment).where(
                    Payment.client_id.in_(client_ids),
                    Payment.is_deleted.is_(False),
                )
            )
        )
        for payment in payments:
            payments_by_client[payment.client_id].append(payment)

        mandatory_items = list(
            db.scalars(
                select(ClientMandatoryPayment).where(
                    ClientMandatoryPayment.client_id.in_(client_ids)
                )
            )
        )
        for item in mandatory_items:
            mandatory_by_client[item.client_id].append(item)

        plans = list(
            db.scalars(select(InstallmentPlan).where(InstallmentPlan.client_id.in_(client_ids)))
        )
        plan_ids = [plan.id for plan in plans]
        for plan in plans:
            plan_total_by_client[plan.client_id] = plan.total_amount

        if plan_ids:
            schedules = list(
                db.scalars(
                    select(PaymentSchedule).where(
                        PaymentSchedule.installment_plan_id.in_(plan_ids)
                    )
                )
            )
            plan_client_map = {plan.id: plan.client_id for plan in plans}
            for schedule in schedules:
                client_id = plan_client_map[schedule.installment_plan_id]
                schedule_by_client[client_id].append(schedule)

    client_profits = _build_client_metrics(
        db,
        clients,
        payments_by_client,
        mandatory_by_client,
        schedule_by_client,
        plan_total_by_client,
    )

    monthly_expenses = _monthly_expenses_total(db, user.organization_id)
    today = date.today()
    periods = _month_periods(months, today)
    range_start = periods[0][1]

    collected_by_month: dict[str, Decimal] = defaultdict(lambda: Decimal("0.00"))
    expected_by_month: dict[str, Decimal] = defaultdict(lambda: Decimal("0.00"))
    payments_count_by_month: dict[str, int] = defaultdict(int)

    for payment in (
        payment
        for client_payments in payments_by_client.values()
        for payment in client_payments
        if payment.payment_date >= range_start
    ):
        month_key = f"{payment.payment_date.year:04d}-{payment.payment_date.month:02d}"
        collected_by_month[month_key] += _payment_signed(payment.amount, payment.is_refund)
        if not payment.is_refund:
            payments_count_by_month[month_key] += 1

    for schedules in schedule_by_client.values():
        for item in schedules:
            if item.due_date < range_start:
                continue
            month_key = f"{item.due_date.year:04d}-{item.due_date.month:02d}"
            expected_by_month[month_key] += item.planned_amount

    trends = [
        MonthlyTrendPoint(
            month=month_key,
            collected=collected_by_month[month_key],
            expected=expected_by_month[month_key],
            expenses=monthly_expenses,
            net_profit=collected_by_month[month_key] - monthly_expenses,
            payments_count=payments_count_by_month[month_key],
        )
        for month_key, _, _ in periods
    ]

    summary = AnalyticsSummary(
        clients_count=len(clients),
        collected_total=sum((item.collected_total for item in client_profits), Decimal("0.00")),
        profit_total=sum((item.profit for item in client_profits), Decimal("0.00")),
        schedule_remainder_total=sum(
            (item.schedule_remainder for item in client_profits),
            Decimal("0.00"),
        ),
        monthly_expenses=monthly_expenses,
    )

    return AnalyticsOverview(summary=summary, trends=trends, client_profits=client_profits)
