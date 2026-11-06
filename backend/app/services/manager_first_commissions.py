"""Менеджерские выплаты за договоры банкротства.

Свой клиент — 10 000 ₽ в месяце даты договора. Клиент от удалённого
менеджера — 5 000 ₽ в месяце первого платежа по договору (вторые 5 000 ₽
получает агент, см. services/agents.py).
"""

from collections import defaultdict
from datetime import date
from decimal import Decimal
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.models.client import (
    MANAGER_COMMISSION_FOR_AGENT_CLIENT,
    MANAGER_FIRST_COMMISSION_SINCE,
    MANAGER_FIRST_PAYMENT_COMMISSION,
    Client,
)
from app.models.enums import ClientStatus, EngagementStage
from app.models.payment import Payment
from app.models.user import User
from app.schemas.manager_first_commissions import (
    ManagerFirstCommissionClientItem,
    ManagerFirstCommissionManagerRow,
    ManagerFirstCommissionsOverview,
)
from app.services.phone import month_bounds


def first_payment_dates_subquery():
    """client_id → дата первого настоящего платежа (без возвратов и удалённых)."""
    return (
        select(
            Payment.client_id.label("client_id"),
            func.min(Payment.payment_date).label("first_payment_date"),
        )
        .where(Payment.is_deleted.is_(False), Payment.is_refund.is_(False))
        .group_by(Payment.client_id)
        .subquery()
    )


def contract_client_filters(organization_id: UUID) -> tuple:
    return (
        Client.organization_id == organization_id,
        Client.is_deleted.is_(False),
        Client.engagement_stage == EngagementStage.BANKRUPTCY,
        Client.status != ClientStatus.CANCELLED,
    )


def _empty_overview(month: str) -> ManagerFirstCommissionsOverview:
    return ManagerFirstCommissionsOverview(
        month=month,
        commission_per_client=MANAGER_FIRST_PAYMENT_COMMISSION,
        clients_count=0,
        total_amount=Decimal("0.00"),
        to_pay_amount=Decimal("0.00"),
        paid_amount=Decimal("0.00"),
        outstanding_to_pay_amount=Decimal("0.00"),
        managers=[],
    )


def get_manager_first_commissions_overview(
    db: Session,
    user: User,
    *,
    month: str,
) -> ManagerFirstCommissionsOverview:
    """Сводка к выдаче за месяц по каждому менеджеру."""
    start, end = month_bounds(month)
    if end < MANAGER_FIRST_COMMISSION_SINCE:
        return _empty_overview(month)

    period_start = max(start, MANAGER_FIRST_COMMISSION_SINCE)
    base_filters = contract_client_filters(user.organization_id)

    office_clients = list(
        db.scalars(
            select(Client)
            .options(joinedload(Client.assigned_manager))
            .where(
                *base_filters,
                Client.source_agent_id.is_(None),
                Client.contract_date >= period_start,
                Client.contract_date <= end,
            )
            .order_by(Client.contract_date.desc(), Client.full_name.asc())
        ).unique()
    )

    office_outstanding_ids = list(
        db.scalars(
            select(Client.id).where(
                *base_filters,
                Client.source_agent_id.is_(None),
                Client.contract_date >= MANAGER_FIRST_COMMISSION_SINCE,
                Client.manager_first_commission_collected.is_(False),
            )
        )
    )

    first_paid = first_payment_dates_subquery()
    agent_rows: list[tuple[Client, date]] = list(
        db.execute(
            select(Client, first_paid.c.first_payment_date)
            .join(first_paid, first_paid.c.client_id == Client.id)
            .options(joinedload(Client.assigned_manager))
            .where(
                *base_filters,
                Client.source_agent_id.is_not(None),
                first_paid.c.first_payment_date >= period_start,
                first_paid.c.first_payment_date <= end,
            )
            .order_by(first_paid.c.first_payment_date.desc(), Client.full_name.asc())
        ).unique()
    )

    agent_outstanding_count = db.scalar(
        select(func.count())
        .select_from(Client)
        .join(first_paid, first_paid.c.client_id == Client.id)
        .where(
            *base_filters,
            Client.source_agent_id.is_not(None),
            first_paid.c.first_payment_date >= MANAGER_FIRST_COMMISSION_SINCE,
            Client.manager_first_commission_collected.is_(False),
        )
    ) or 0

    outstanding_to_pay = (
        MANAGER_FIRST_PAYMENT_COMMISSION * len(office_outstanding_ids)
        + MANAGER_COMMISSION_FOR_AGENT_CLIENT * agent_outstanding_count
    )

    by_manager: dict[UUID | None, list[ManagerFirstCommissionClientItem]] = defaultdict(list)
    names: dict[UUID | None, str] = {None: "Без менеджера"}

    def add_item(client: Client, amount: Decimal, first_payment_date: date | None) -> None:
        manager_id = client.assigned_manager_id
        manager_name = (
            client.assigned_manager.full_name if client.assigned_manager is not None else "Без менеджера"
        )
        names[manager_id] = manager_name
        by_manager[manager_id].append(
            ManagerFirstCommissionClientItem(
                client_id=client.id,
                client_name=client.full_name,
                contract_date=client.contract_date,
                manager_id=manager_id,
                manager_name=manager_name,
                amount=amount,
                collected=client.manager_first_commission_collected,
                collected_at=client.manager_first_commission_collected_at,
                from_agent=first_payment_date is not None,
                first_payment_date=first_payment_date,
            )
        )

    for client in office_clients:
        add_item(client, MANAGER_FIRST_PAYMENT_COMMISSION, None)
    for client, first_payment_date in agent_rows:
        add_item(client, MANAGER_COMMISSION_FOR_AGENT_CLIENT, first_payment_date)

    managers: list[ManagerFirstCommissionManagerRow] = []
    total_amount = Decimal("0.00")
    to_pay_amount = Decimal("0.00")
    paid_amount = Decimal("0.00")
    clients_count = 0

    for manager_id, items in by_manager.items():
        row_total = sum((item.amount for item in items), Decimal("0.00"))
        row_paid = sum((item.amount for item in items if item.collected), Decimal("0.00"))
        row_to_pay = row_total - row_paid
        total_amount += row_total
        to_pay_amount += row_to_pay
        paid_amount += row_paid
        clients_count += len(items)
        managers.append(
            ManagerFirstCommissionManagerRow(
                manager_id=manager_id,
                manager_name=names.get(manager_id, "Без менеджера"),
                clients_count=len(items),
                total_amount=row_total,
                to_pay_amount=row_to_pay,
                paid_amount=row_paid,
                clients=items,
            )
        )

    managers.sort(key=lambda row: (-float(row.to_pay_amount), row.manager_name.casefold()))

    return ManagerFirstCommissionsOverview(
        month=month,
        commission_per_client=MANAGER_FIRST_PAYMENT_COMMISSION,
        clients_count=clients_count,
        total_amount=total_amount,
        to_pay_amount=to_pay_amount,
        paid_amount=paid_amount,
        outstanding_to_pay_amount=outstanding_to_pay,
        managers=managers,
    )
