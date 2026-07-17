from calendar import monthrange
from datetime import date
from decimal import Decimal

from sqlalchemy import Select, select
from sqlalchemy.orm import Session

from app.models.client import Client
from app.models.enums import ClientStatus, UserRole
from app.models.installment_plan import InstallmentPlan
from app.models.operating_expense import OperatingExpense
from app.models.payment import Payment
from app.models.payment_schedule import PaymentSchedule
from app.models.user import User
from app.schemas.dashboard import DashboardSummary
from app.services.access import apply_client_visibility_filter, client_has_overdue_payments
from app.services.schedule_dates import effective_due_date, payment_window_end


def _month_bounds(today: date) -> tuple[date, date]:
    month_start = today.replace(day=1)
    _, last_day = monthrange(today.year, today.month)
    month_end = today.replace(day=last_day)
    return month_start, month_end


def _visible_clients_stmt(user: User) -> Select:
    stmt = select(Client).where(Client.is_deleted.is_(False))
    return apply_client_visibility_filter(stmt, user)


def _schedule_remainder(planned: Decimal, paid: Decimal) -> Decimal:
    diff = planned - paid
    return diff if diff > Decimal("0.00") else Decimal("0.00")


def _monthly_expenses_total(db: Session, organization_id) -> Decimal:
    expenses = list(
        db.scalars(
            select(OperatingExpense).where(
                OperatingExpense.organization_id == organization_id,
                OperatingExpense.is_active.is_(True),
            )
        )
    )
    return sum((expense.amount for expense in expenses), Decimal("0.00"))


def get_dashboard_summary(db: Session, user: User) -> DashboardSummary:
    clients = list(db.scalars(_visible_clients_stmt(user)))
    active_clients = [client for client in clients if client.status == ClientStatus.ACTIVE]
    clients_overdue = sum(
        1 for client in clients if client_has_overdue_payments(db, client.id)
    )

    if user.role != UserRole.OWNER:
        return DashboardSummary(
            clients_total=len(clients),
            clients_active=len(active_clients),
            clients_overdue=clients_overdue,
            expected_this_month=Decimal("0.00"),
            collected_this_month=Decimal("0.00"),
            overdue_amount=Decimal("0.00"),
            total_remainder=Decimal("0.00"),
            total_collected=Decimal("0.00"),
            active_debt_total=Decimal("0.00"),
            monthly_expenses=Decimal("0.00"),
            net_profit_this_month=Decimal("0.00"),
        )

    monthly_expenses = _monthly_expenses_total(db, user.organization_id)
    today = date.today()
    month_start, month_end = _month_bounds(today)

    client_ids = [client.id for client in clients]
    active_client_ids = [client.id for client in active_clients]
    active_debt_total = sum(
        (client.debt_amount for client in active_clients),
        Decimal("0.00"),
    )

    expected_this_month = Decimal("0.00")
    overdue_amount = Decimal("0.00")
    total_remainder = Decimal("0.00")

    if client_ids:
        schedules = list(
            db.scalars(
                select(PaymentSchedule)
                .join(InstallmentPlan, InstallmentPlan.id == PaymentSchedule.installment_plan_id)
                .where(InstallmentPlan.client_id.in_(client_ids))
            )
        )

        for item in schedules:
            remainder = _schedule_remainder(item.planned_amount, item.paid_amount)
            if remainder <= Decimal("0.00"):
                continue

            total_remainder += remainder

            if month_start <= item.due_date <= month_end:
                expected_this_month += remainder

            if payment_window_end(effective_due_date(item)) < today:
                overdue_amount += remainder

    collected_this_month = Decimal("0.00")
    total_collected = Decimal("0.00")

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
            signed_amount = (
                -payment.amount if payment.is_refund else payment.amount
            )
            total_collected += signed_amount
            if month_start <= payment.payment_date <= month_end:
                collected_this_month += signed_amount

    return DashboardSummary(
        clients_total=len(clients),
        clients_active=len(active_clients),
        clients_overdue=clients_overdue,
        expected_this_month=expected_this_month,
        collected_this_month=collected_this_month,
        overdue_amount=overdue_amount,
        total_remainder=total_remainder,
        total_collected=total_collected,
        active_debt_total=active_debt_total,
        monthly_expenses=monthly_expenses,
        net_profit_this_month=collected_this_month - monthly_expenses,
    )
