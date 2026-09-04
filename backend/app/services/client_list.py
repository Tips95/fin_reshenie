from collections import defaultdict
from datetime import date
from enum import Enum
from uuid import UUID

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.models.client import Client
from app.models.document_collection import DocumentCollection
from app.models.enums import ClientStatus, DocumentCollectionStatus, EngagementStage, ProcedureStage
from app.models.installment_plan import InstallmentPlan
from app.models.payment_schedule import PaymentSchedule
from app.models.user import User
from app.services.access import apply_client_visibility_filter, clients_overdue_map
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


class CollectionViewFilter(str, Enum):
    ACTIVE = "active"
    PAID = "paid"
    CONVERTED = "converted"
    ALL = "all"


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
        overdue_map = clients_overdue_map(db, [client.id for client in clients])
        clients.sort(
            key=lambda client: overdue_map.get(client.id, False),
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
    collection_view: CollectionViewFilter | None = None,
    sort_by: ClientSortField = ClientSortField.CREATED_AT,
    sort_dir: SortDirection = SortDirection.DESC,
) -> list[Client]:
    stmt = select(Client)
    stmt = apply_client_visibility_filter(stmt, user)

    # Поиск по ФИО/телефону — ищем по всей компании. Иначе фильтры «договоры /
    # текущий месяц / сбор» прячут человека, а проверка дублей его всё равно находит.
    searching = bool((phone and phone.strip()) or (name and name.strip()))

    if status_filter is not None:
        stmt = stmt.where(Client.status == status_filter)
    if procedure_stage is not None and not searching:
        stmt = stmt.where(Client.procedure_stage == procedure_stage)
    if engagement_stage is not None and collection_view is None and not searching:
        stmt = stmt.where(Client.engagement_stage == engagement_stage)
    if manager_id is not None:
        stmt = stmt.where(Client.assigned_manager_id == manager_id)
    if phone and phone.strip():
        normalized = normalize_phone(phone)
        if normalized:
            # Как в проверке дублей: сравниваем последние 10 цифр, чтобы
            # 8928… и +7928… находили одного и того же клиента.
            last10 = normalized[-10:] if len(normalized) >= 10 else normalized
            phone_digits = func.replace(
                func.replace(func.replace(Client.phone, " ", ""), "-", ""),
                "+",
                "",
            )
            stmt = stmt.where(
                or_(
                    phone_digits.like(f"%{last10}%"),
                    Client.phone.ilike(f"%{phone.strip()}%"),
                )
            )
    if name and name.strip():
        stmt = stmt.where(Client.full_name.ilike(f"%{name.strip()}%"))
    if contract_month and not searching:
        start, end = month_bounds(contract_month)
        stmt = stmt.where(Client.contract_date >= start, Client.contract_date <= end)
    if due_month and not searching:
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

    if collection_view is not None and not searching:
        # OUTER JOIN: клиент на сборе без записи DocumentCollection иначе
        # не виден ни в сборе, ни в договорах, но дубль его блокирует.
        stmt = stmt.outerjoin(
            DocumentCollection,
            DocumentCollection.client_id == Client.id,
        )
        if collection_view == CollectionViewFilter.ACTIVE:
            stmt = stmt.where(Client.engagement_stage == EngagementStage.DOCUMENT_COLLECTION)
        elif collection_view == CollectionViewFilter.PAID:
            stmt = stmt.where(
                Client.engagement_stage == EngagementStage.DOCUMENT_COLLECTION,
                DocumentCollection.status == DocumentCollectionStatus.PAID,
            )
        elif collection_view == CollectionViewFilter.CONVERTED:
            stmt = stmt.where(
                Client.engagement_stage == EngagementStage.BANKRUPTCY,
                DocumentCollection.status == DocumentCollectionStatus.PAID,
            )

    clients = list(db.scalars(stmt).unique())

    if overdue is not None:
        overdue_map = clients_overdue_map(db, [client.id for client in clients])
        clients = [
            client
            for client in clients
            if overdue_map.get(client.id, False) == overdue
        ]

    return sort_clients(db, clients, sort_by=sort_by, sort_dir=sort_dir)


def clients_latest_notes_map(
    db: Session,
    client_ids: list[UUID],
    *,
    due_month: str | None = None,
) -> dict[UUID, tuple[str | None, int]]:
    """Latest non-empty schedule note per client: (text, notes_count).

    If due_month is set, prefer a note on a month that falls into that window.
    """
    if not client_ids:
        return {}

    rows = db.execute(
        select(
            InstallmentPlan.client_id,
            PaymentSchedule.manager_note,
            PaymentSchedule.due_date,
            PaymentSchedule.deferred_until,
            PaymentSchedule.month_number,
        )
        .join(PaymentSchedule, PaymentSchedule.installment_plan_id == InstallmentPlan.id)
        .where(InstallmentPlan.client_id.in_(client_ids))
    ).all()

    grouped: dict[UUID, list[tuple[str, date, int]]] = defaultdict(list)
    for client_id, note, due_date, deferred_until, month_number in rows:
        text = (note or "").strip()
        if not text:
            continue
        grouped[client_id].append((text, deferred_until or due_date, month_number))

    month_start = month_end = None
    if due_month:
        month_start, month_end = month_bounds(due_month)

    result: dict[UUID, tuple[str | None, int]] = {}
    for client_id in client_ids:
        notes = grouped.get(client_id, [])
        if not notes:
            result[client_id] = (None, 0)
            continue
        notes.sort(key=lambda item: (item[1], item[2]), reverse=True)
        chosen = notes[0]
        if month_start is not None and month_end is not None:
            in_month = [item for item in notes if month_start <= item[1] <= month_end]
            if in_month:
                chosen = in_month[0]
        result[client_id] = (chosen[0], len(notes))
    return result


def paginate_clients(
    clients: list[Client],
    *,
    page: int,
    page_size: int,
) -> tuple[list[Client], int]:
    total = len(clients)
    if total == 0:
        return [], 0
    start = (page - 1) * page_size
    return clients[start : start + page_size], total
