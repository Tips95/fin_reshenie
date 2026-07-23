from decimal import Decimal
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.client import Client
from app.models.enums import ClientStatus, EngagementStage
from app.models.installment_plan import InstallmentPlan
from app.models.payment_schedule import PaymentSchedule


def get_client_contract_total(db: Session, client_id: UUID) -> Decimal | None:
    plan = db.scalar(
        select(InstallmentPlan)
        .where(InstallmentPlan.client_id == client_id)
        .order_by(InstallmentPlan.created_at.desc())
        .limit(1)
    )
    if plan is None:
        return None

    schedules = list(
        db.scalars(
            select(PaymentSchedule).where(PaymentSchedule.installment_plan_id == plan.id)
        )
    )
    if schedules:
        return sum((item.planned_amount for item in schedules), Decimal("0.00"))
    return plan.total_amount


def contract_totals_by_client(
    db: Session,
    client_ids: list[UUID],
) -> dict[UUID, Decimal | None]:
    if not client_ids:
        return {}

    plans = list(
        db.scalars(select(InstallmentPlan).where(InstallmentPlan.client_id.in_(client_ids)))
    )
    plan_by_client = {plan.client_id: plan for plan in plans}
    plan_ids = [plan.id for plan in plans]

    schedule_totals: dict[UUID, Decimal] = {}
    if plan_ids:
        rows = db.execute(
            select(InstallmentPlan.client_id, func.sum(PaymentSchedule.planned_amount))
            .join(PaymentSchedule, PaymentSchedule.installment_plan_id == InstallmentPlan.id)
            .where(InstallmentPlan.id.in_(plan_ids))
            .group_by(InstallmentPlan.client_id)
        )
        schedule_totals = {client_id: total for client_id, total in rows}

    result: dict[UUID, Decimal | None] = {}
    for client_id in client_ids:
        if client_id in schedule_totals:
            result[client_id] = schedule_totals[client_id]
        elif client_id in plan_by_client:
            result[client_id] = plan_by_client[client_id].total_amount
        else:
            result[client_id] = None
    return result


def sum_active_contract_totals(db: Session, clients: list[Client]) -> Decimal:
    active_bankruptcy_ids = [
        client.id
        for client in clients
        if client.status == ClientStatus.ACTIVE
        and client.engagement_stage == EngagementStage.BANKRUPTCY
    ]
    if not active_bankruptcy_ids:
        return Decimal("0.00")

    schedules = list(
        db.scalars(
            select(PaymentSchedule)
            .join(InstallmentPlan, InstallmentPlan.id == PaymentSchedule.installment_plan_id)
            .where(InstallmentPlan.client_id.in_(active_bankruptcy_ids))
        )
    )
    return sum((item.planned_amount for item in schedules), Decimal("0.00"))
