"""Менеджерские 10 000 ₽ за каждого клиента, переведённого на банкротство."""

from collections import defaultdict
from decimal import Decimal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.models.client import (
    MANAGER_FIRST_COMMISSION_SINCE,
    MANAGER_FIRST_PAYMENT_COMMISSION,
    Client,
)
from app.models.enums import ClientStatus, EngagementStage
from app.models.user import User
from app.schemas.manager_first_commissions import (
    ManagerFirstCommissionClientItem,
    ManagerFirstCommissionManagerRow,
    ManagerFirstCommissionsOverview,
)
from app.services.phone import month_bounds


def get_manager_first_commissions_overview(
    db: Session,
    user: User,
    *,
    month: str,
) -> ManagerFirstCommissionsOverview:
    """Сводка к выдаче за месяц: 10 000 ₽ × договоры на банкротстве с октября 2026."""
    start, end = month_bounds(month)
    if end < MANAGER_FIRST_COMMISSION_SINCE:
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

    period_start = max(start, MANAGER_FIRST_COMMISSION_SINCE)

    clients = list(
        db.scalars(
            select(Client)
            .options(joinedload(Client.assigned_manager))
            .where(
                Client.organization_id == user.organization_id,
                Client.is_deleted.is_(False),
                Client.engagement_stage == EngagementStage.BANKRUPTCY,
                Client.status != ClientStatus.CANCELLED,
                Client.contract_date >= period_start,
                Client.contract_date <= end,
            )
            .order_by(Client.contract_date.desc(), Client.full_name.asc())
        ).unique()
    )

    outstanding_ids = list(
        db.scalars(
            select(Client.id).where(
                Client.organization_id == user.organization_id,
                Client.is_deleted.is_(False),
                Client.engagement_stage == EngagementStage.BANKRUPTCY,
                Client.status != ClientStatus.CANCELLED,
                Client.contract_date >= MANAGER_FIRST_COMMISSION_SINCE,
                Client.manager_first_commission_collected.is_(False),
            )
        )
    )
    outstanding_to_pay = MANAGER_FIRST_PAYMENT_COMMISSION * len(outstanding_ids)

    by_manager: dict[UUID | None, list[ManagerFirstCommissionClientItem]] = defaultdict(list)
    names: dict[UUID | None, str] = {None: "Без менеджера"}

    for client in clients:
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
                amount=MANAGER_FIRST_PAYMENT_COMMISSION,
                collected=client.manager_first_commission_collected,
                collected_at=client.manager_first_commission_collected_at,
            )
        )

    managers: list[ManagerFirstCommissionManagerRow] = []
    total_amount = Decimal("0.00")
    to_pay_amount = Decimal("0.00")
    paid_amount = Decimal("0.00")

    for manager_id, items in by_manager.items():
        row_total = MANAGER_FIRST_PAYMENT_COMMISSION * len(items)
        row_paid = MANAGER_FIRST_PAYMENT_COMMISSION * sum(1 for item in items if item.collected)
        row_to_pay = row_total - row_paid
        total_amount += row_total
        to_pay_amount += row_to_pay
        paid_amount += row_paid
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
        clients_count=len(clients),
        total_amount=total_amount,
        to_pay_amount=to_pay_amount,
        paid_amount=paid_amount,
        outstanding_to_pay_amount=outstanding_to_pay,
        managers=managers,
    )
