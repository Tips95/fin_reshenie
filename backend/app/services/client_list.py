from enum import Enum
from uuid import UUID

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.models.client import Client
from app.models.enums import ClientStatus, EngagementStage, ProcedureStage
from app.models.installment_plan import InstallmentPlan
from app.models.payment_schedule import PaymentSchedule
from app.models.user import User
from app.services.access import apply_client_visibility_filter, client_has_overdue_payments
from app.services.phone import month_bounds, normalize_phone


class ClientSortField(str, Enum):
    FULL_NAME = "full_name"
    CONTRACT_DATE = "contract_date"
    DEBT_AMOUNT = "debt_amount"
    STATUS = "status"
    OVERDUE = "overdue"
    CREATED_AT = "created_at"


class SortDirection(str, Enum):
    ASC = "asc"
    DESC = "desc"


def sort_clients(
    db: Session,
    clients: list[Client],
    *,
    sort_by: ClientSortField = ClientSortField.CREATED_AT,
    sort_dir: SortDirection = SortDirection.DESC,
) -> list[Client]:
    reverse = sort_dir == SortDirection.DESC

    if sort_by == ClientSortField.FULL_NAME:
        clients.sort(key=lambda client: client.full_name.casefold(), reverse=reverse)
    elif sort_by == ClientSortField.CONTRACT_DATE:
        clients.sort(key=lambda client: client.contract_date, reverse=reverse)
    elif sort_by == ClientSortField.DEBT_AMOUNT:
        clients.sort(key=lambda client: client.debt_amount, reverse=reverse)
    elif sort_by == ClientSortField.STATUS:
        clients.sort(key=lambda client: client.status.value, reverse=reverse)
    elif sort_by == ClientSortField.OVERDUE:
        clients.sort(
            key=lambda client: client_has_overdue_payments(db, client.id),
            reverse=reverse,
        )
    else:
        clients.sort(key=lambda client: client.created_at, reverse=reverse)

    return clients


def query_clients(
    db: Session,
    user: User,
    *,
    status_filter: ClientStatus | None = None,
    procedure_stage: ProcedureStage | None = None,
    engagement_stage: EngagementStage | None = None,
    manager_id: UUID | None = None,
    overdue: bool | None = None,
    phone: str | None = None,
    name: str | None = None,
    contract_month: str | None = None,
    due_month: str | None = None,
    sort_by: ClientSortField = ClientSortField.CREATED_AT,
    sort_dir: SortDirection = SortDirection.DESC,
) -> list[Client]:
    stmt = select(Client)
    stmt = apply_client_visibility_filter(stmt, user)

    if status_filter is not None:
        stmt = stmt.where(Client.status == status_filter)
    if procedure_stage is not None:
        stmt = stmt.where(Client.procedure_stage == procedure_stage)
    if engagement_stage is not None:
        stmt = stmt.where(Client.engagement_stage == engagement_stage)
    if manager_id is not None:
        stmt = stmt.where(Client.assigned_manager_id == manager_id)
    if phone:
        normalized = normalize_phone(phone)
        if normalized:
            stmt = stmt.where(
                or_(
                    func.replace(func.replace(func.replace(Client.phone, " ", ""), "-", ""), "+", "").like(
                        f"%{normalized}%"
                    ),
                    Client.phone.ilike(f"%{phone.strip()}%"),
                )
            )
    if name:
        stmt = stmt.where(Client.full_name.ilike(f"%{name.strip()}%"))
    if contract_month:
        start, end = month_bounds(contract_month)
        stmt = stmt.where(Client.contract_date >= start, Client.contract_date <= end)
    if due_month:
        start, end = month_bounds(due_month)
        client_ids = db.scalars(
            select(InstallmentPlan.client_id)
            .join(PaymentSchedule, PaymentSchedule.installment_plan_id == InstallmentPlan.id)
            .where(
                func.coalesce(PaymentSchedule.deferred_until, PaymentSchedule.due_date) >= start,
                func.coalesce(PaymentSchedule.deferred_until, PaymentSchedule.due_date) <= end,
            )
            .distinct()
        )
        stmt = stmt.where(Client.id.in_(list(client_ids)))

    clients = list(db.scalars(stmt))

    if overdue is not None:
        clients = [client for client in clients if client_has_overdue_payments(db, client.id) == overdue]

    return sort_clients(db, clients, sort_by=sort_by, sort_dir=sort_dir)
