from decimal import Decimal
from uuid import UUID

from sqlalchemy import select
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
