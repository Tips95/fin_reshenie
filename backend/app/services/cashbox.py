"""Касса: единая очередь того, что осталось получить с клиентов.

Собирает в одном месте три источника поступлений — платежи по графику
рассрочки, оплату сбора документов и обязательные платежи, — чтобы
руководителю не приходилось открывать карточку каждого клиента.
"""

from datetime import date
from decimal import Decimal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.client import Client
from app.models.client_mandatory_payment import ClientMandatoryPayment
from app.models.document_collection import DocumentCollection
from app.models.enums import DocumentCollectionStatus, EngagementStage
from app.models.installment_plan import InstallmentPlan
from app.models.payment import Payment
from app.models.payment_schedule import PaymentSchedule
from app.models.user import User
from app.schemas.cashbox import (
    CashboxCollectionItem,
    CashboxGroupTotals,
    CashboxMandatoryItem,
    CashboxOverview,
    CashboxScheduleItem,
)
from app.services.access import apply_client_visibility_filter
from app.services.phone import month_bounds
from app.services.schedule_dates import (
    effective_due_date,
    is_schedule_overdue,
    schedule_overdue_days,
    schedule_remainder,
)

ZERO = Decimal("0.00")


def _manager_names(db: Session, organization_id: UUID) -> dict[UUID, str]:
    rows = db.execute(
        select(User.id, User.full_name).where(User.organization_id == organization_id)
    )
    return {user_id: full_name for user_id, full_name in rows}


def _totals(amounts: list[Decimal]) -> CashboxGroupTotals:
    return CashboxGroupTotals(count=len(amounts), amount=sum(amounts, ZERO))


def _schedule_items(
    db: Session,
    clients: dict[UUID, Client],
    managers: dict[UUID, str],
    *,
    month_end: date,
    today: date,
) -> list[CashboxScheduleItem]:
    if not clients:
        return []

    rows = db.execute(
        select(InstallmentPlan.client_id, PaymentSchedule)
        .join(PaymentSchedule, PaymentSchedule.installment_plan_id == InstallmentPlan.id)
        .where(InstallmentPlan.client_id.in_(list(clients)))
    )

    items: list[CashboxScheduleItem] = []
    for client_id, schedule in rows:
        remainder = schedule_remainder(schedule)
        if remainder <= ZERO:
            continue

        due = effective_due_date(schedule)
        if due > month_end:
            continue

        client = clients[client_id]
        items.append(
            CashboxScheduleItem(
                schedule_id=schedule.id,
                client_id=client_id,
                client_name=client.full_name,
                phone=client.phone,
                month_number=schedule.month_number,
                due_date=due,
                planned_amount=schedule.planned_amount,
                paid_amount=schedule.paid_amount,
                remainder=remainder,
                status=schedule.status,
                is_overdue=is_schedule_overdue(schedule, today),
                overdue_days=schedule_overdue_days(schedule, today),
                is_deferred=schedule.deferred_until is not None,
                manager_name=managers.get(client.assigned_manager_id),
            )
        )

    items.sort(key=lambda item: (not item.is_overdue, item.due_date, item.client_name))
    return items


def _collection_items(
    db: Session,
    clients: dict[UUID, Client],
    managers: dict[UUID, str],
    *,
    month_end: date,
    today: date,
) -> list[CashboxCollectionItem]:
    if not clients:
        return []

    rows = db.scalars(
        select(DocumentCollection).where(
            DocumentCollection.client_id.in_(list(clients)),
            DocumentCollection.status == DocumentCollectionStatus.PENDING,
        )
    )

    items: list[CashboxCollectionItem] = []
    for collection in rows:
        client = clients.get(collection.client_id)
        if client is None or client.engagement_stage != EngagementStage.DOCUMENT_COLLECTION:
            continue
        if client.contract_date > month_end:
            continue

        items.append(
            CashboxCollectionItem(
                client_id=client.id,
                client_name=client.full_name,
                phone=client.phone,
                contract_date=client.contract_date,
                total_amount=collection.total_amount,
                collection_fee=collection.collection_fee,
                notary_fee=collection.notary_fee,
                manager_commission=collection.manager_commission,
                waiting_days=max((today - client.contract_date).days, 0),
                manager_name=managers.get(client.assigned_manager_id),
            )
        )

    items.sort(key=lambda item: (-item.waiting_days, item.client_name))
    return items


def _mandatory_items(
    db: Session,
    clients: dict[UUID, Client],
    *,
    month_end: date,
) -> list[CashboxMandatoryItem]:
    if not clients:
        return []

    rows = db.scalars(
        select(ClientMandatoryPayment).where(
            ClientMandatoryPayment.client_id.in_(list(clients)),
            ClientMandatoryPayment.is_applicable.is_(True),
        )
    )

    items: list[CashboxMandatoryItem] = []
    for item in rows:
        client = clients.get(item.client_id)
        if client is None or client.contract_date > month_end:
            continue

        remainder = item.planned_amount - item.paid_amount
        if item.planned_amount <= ZERO or remainder <= ZERO:
            continue

        items.append(
            CashboxMandatoryItem(
                mandatory_payment_id=item.id,
                client_id=client.id,
                client_name=client.full_name,
                phone=client.phone,
                payment_type=item.payment_type,
                planned_amount=item.planned_amount,
                paid_amount=item.paid_amount,
                remainder=remainder,
            )
        )

    items.sort(key=lambda item: (item.client_name, item.payment_type.value))
    return items


def _collected_in_month(
    db: Session,
    client_ids: list[UUID],
    *,
    month_start: date,
    month_end: date,
) -> Decimal:
    if not client_ids:
        return ZERO

    payments = db.scalars(
        select(Payment).where(
            Payment.client_id.in_(client_ids),
            Payment.is_deleted.is_(False),
            Payment.payment_date >= month_start,
            Payment.payment_date <= month_end,
        )
    )
    return sum(
        ((-payment.amount if payment.is_refund else payment.amount) for payment in payments),
        ZERO,
    )


def get_cashbox_overview(
    db: Session,
    user: User,
    *,
    month: str,
    today: date | None = None,
) -> CashboxOverview:
    check_date = today or date.today()
    month_start, month_end = month_bounds(month)

    clients = {
        client.id: client
        for client in db.scalars(apply_client_visibility_filter(select(Client), user))
    }
    managers = _manager_names(db, user.organization_id)

    schedule_items = _schedule_items(
        db, clients, managers, month_end=month_end, today=check_date
    )
    collection_items = _collection_items(
        db, clients, managers, month_end=month_end, today=check_date
    )
    mandatory_items = _mandatory_items(db, clients, month_end=month_end)

    schedule_totals = _totals([item.remainder for item in schedule_items])
    collection_totals = _totals([item.total_amount for item in collection_items])
    mandatory_totals = _totals([item.remainder for item in mandatory_items])

    return CashboxOverview(
        month=month,
        collected_in_month=_collected_in_month(
            db,
            list(clients),
            month_start=month_start,
            month_end=month_end,
        ),
        expected_total=schedule_totals.amount + collection_totals.amount + mandatory_totals.amount,
        schedule_totals=schedule_totals,
        collection_totals=collection_totals,
        mandatory_totals=mandatory_totals,
        overdue_count=sum(1 for item in schedule_items if item.is_overdue),
        schedule_items=schedule_items,
        collection_items=collection_items,
        mandatory_items=mandatory_items,
    )
