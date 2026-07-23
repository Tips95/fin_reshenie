from calendar import monthrange
from datetime import date
from decimal import Decimal

from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session

from app.models.client import Client
from app.models.enums import ClientStatus, TaskStatus, UserRole
from app.models.installment_plan import InstallmentPlan
from app.models.manager_task import ManagerTask
from app.models.operating_expense import OperatingExpense
from app.models.payment import Payment
from app.models.payment_schedule import PaymentSchedule
from app.models.user import User
from app.schemas.dashboard import (
    DashboardOverdueClientItem,
    DashboardSummary,
    DocumentCollectionBreakdown,
    MandatoryPaymentBreakdown,
)
from app.services.access import apply_client_visibility_filter, clients_overdue_map
from app.services.document_collection_stats import (
    count_contracts_signed_in_period,
    get_document_collection_paid_totals,
)
from app.services.mandatory_payment_stats import MandatoryPaymentTotals, breakdown_from_totals, get_mandatory_paid_totals
from app.services.client_finances import contract_totals_by_client, sum_active_contract_totals
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


def _to_breakdown(totals: MandatoryPaymentTotals) -> MandatoryPaymentBreakdown:
    return breakdown_from_totals(totals)


def _empty_breakdown() -> MandatoryPaymentBreakdown:
    return _to_breakdown(
        MandatoryPaymentTotals(
            deposit=Decimal("0.00"),
            financial_management=Decimal("0.00"),
            court_fee=Decimal("0.00"),
        )
    )


def _empty_document_collection() -> DocumentCollectionBreakdown:
    return DocumentCollectionBreakdown(
        collection_cash=Decimal("0.00"),
        notary_fee=Decimal("0.00"),
        manager_commission=Decimal("0.00"),
        paid_count=0,
    )


def _to_document_collection_breakdown(totals) -> DocumentCollectionBreakdown:
    return DocumentCollectionBreakdown(
        collection_cash=totals.collection_cash,
        notary_fee=totals.notary_fee,
        manager_commission=totals.manager_commission,
        paid_count=totals.paid_count,
    )


def _count_open_tasks(db: Session, user: User, client_ids: list) -> int:
    if not client_ids:
        return 0

    stmt = (
        select(func.count())
        .select_from(ManagerTask)
        .where(
            ManagerTask.organization_id == user.organization_id,
            ManagerTask.status == TaskStatus.OPEN,
            ManagerTask.client_id.in_(client_ids),
        )
    )
    if user.role == UserRole.MANAGER:
        stmt = stmt.where(ManagerTask.assigned_manager_id == user.id)

    return db.scalar(stmt) or 0


def _build_overdue_clients_preview(
    db: Session,
    clients: list[Client],
    overdue_map: dict,
    *,
    limit: int = 10,
) -> list[DashboardOverdueClientItem]:
    overdue_clients = [client for client in clients if overdue_map.get(client.id, False)]
    overdue_clients.sort(key=lambda client: client.created_at, reverse=True)
    preview_clients = overdue_clients[:limit]
    contract_totals = contract_totals_by_client(db, [client.id for client in preview_clients])

    return [
        DashboardOverdueClientItem(
            id=client.id,
            full_name=client.full_name,
            phone=client.phone,
            contract_date=client.contract_date,
            status=client.status,
            contract_total=contract_totals.get(client.id),
        )
        for client in preview_clients
    ]


def _dashboard_activity_fields(
    db: Session,
    user: User,
    clients: list[Client],
    overdue_map: dict,
) -> tuple[int, list[DashboardOverdueClientItem]]:
    if user.role not in (UserRole.OWNER, UserRole.MANAGER):
        return 0, []

    client_ids = [client.id for client in clients]
    return (
        _count_open_tasks(db, user, client_ids),
        _build_overdue_clients_preview(db, clients, overdue_map),
    )


def get_dashboard_summary(db: Session, user: User) -> DashboardSummary:
    clients = list(db.scalars(_visible_clients_stmt(user)))
    active_clients = [client for client in clients if client.status == ClientStatus.ACTIVE]
    client_ids = [client.id for client in clients]
    overdue_map = clients_overdue_map(db, client_ids)
    clients_overdue = sum(1 for client_id in client_ids if overdue_map.get(client_id, False))
    open_tasks_count, overdue_clients_preview = _dashboard_activity_fields(
        db,
        user,
        clients,
        overdue_map,
    )
    empty = _empty_breakdown()
    empty_collection = _empty_document_collection()

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
            active_contract_total=Decimal("0.00"),
            monthly_expenses=Decimal("0.00"),
            mandatory_paid_total=empty,
            mandatory_paid_this_month=empty,
            document_collection_total=empty_collection,
            document_collection_this_month=empty_collection,
            contracts_signed_this_month=0,
            org_profit_total=Decimal("0.00"),
            net_profit_this_month=Decimal("0.00"),
            open_tasks_count=open_tasks_count,
            overdue_clients_preview=overdue_clients_preview,
        )

    monthly_expenses = _monthly_expenses_total(db, user.organization_id)
    today = date.today()
    month_start, month_end = _month_bounds(today)

    active_contract_total = sum_active_contract_totals(db, clients)

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
            signed_amount = -payment.amount if payment.is_refund else payment.amount
            total_collected += signed_amount
            if month_start <= payment.payment_date <= month_end:
                collected_this_month += signed_amount

    mandatory_paid_total = _to_breakdown(get_mandatory_paid_totals(db, client_ids))
    mandatory_paid_this_month = _to_breakdown(
        get_mandatory_paid_totals(
            db,
            client_ids,
            date_from=month_start,
            date_to=month_end,
        )
    )

    document_collection_total = _to_document_collection_breakdown(
        get_document_collection_paid_totals(db, client_ids)
    )
    document_collection_this_month = _to_document_collection_breakdown(
        get_document_collection_paid_totals(
            db,
            client_ids,
            date_from=month_start,
            date_to=month_end,
        )
    )
    contracts_signed_this_month = count_contracts_signed_in_period(
        db,
        client_ids,
        date_from=month_start,
        date_to=month_end,
    )

    org_profit_total = (
        total_collected
        + document_collection_total.collection_cash
        - mandatory_paid_total.total
    )
    net_profit_this_month = (
        collected_this_month
        + document_collection_this_month.collection_cash
        - mandatory_paid_this_month.total
        - monthly_expenses
    )

    return DashboardSummary(
        clients_total=len(clients),
        clients_active=len(active_clients),
        clients_overdue=clients_overdue,
        expected_this_month=expected_this_month,
        collected_this_month=collected_this_month,
        overdue_amount=overdue_amount,
        total_remainder=total_remainder,
        total_collected=total_collected,
        active_contract_total=active_contract_total,
        monthly_expenses=monthly_expenses,
        mandatory_paid_total=mandatory_paid_total,
        mandatory_paid_this_month=mandatory_paid_this_month,
        document_collection_total=document_collection_total,
        document_collection_this_month=document_collection_this_month,
        contracts_signed_this_month=contracts_signed_this_month,
        org_profit_total=org_profit_total,
        net_profit_this_month=net_profit_this_month,
        open_tasks_count=open_tasks_count,
        overdue_clients_preview=overdue_clients_preview,
    )
