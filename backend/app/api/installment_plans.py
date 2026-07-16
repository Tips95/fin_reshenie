from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_active_user, require_owner_or_manager
from app.core.database import get_db
from app.models.enums import AuditAction, UserRole
from app.models.installment_plan import InstallmentPlan
from app.models.user import User
from app.schemas.installment_plan import InstallmentPlanCreate, InstallmentPlanResponse
from app.services.access import (
    ensure_client_read_access,
    ensure_client_write_access,
    find_pricing_tier,
    get_installment_plan_for_client,
    get_organization_pricing_tier,
)
from app.services.audit import log_audit
from app.services.installment_schedule import create_payment_schedule_models

router = APIRouter()


@router.get("/{client_id}/installment-plans", response_model=list[InstallmentPlanResponse])
def list_installment_plans(
    client_id: UUID,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> list[InstallmentPlan]:
    if current_user.role == UserRole.CALL_CENTER:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Недостаточно прав")
    ensure_client_read_access(db, current_user, client_id)
    stmt = (
        select(InstallmentPlan)
        .where(InstallmentPlan.client_id == client_id)
        .order_by(InstallmentPlan.created_at.desc())
    )
    return list(db.scalars(stmt))


@router.post(
    "/{client_id}/installment-plans",
    response_model=InstallmentPlanResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_installment_plan(
    client_id: UUID,
    payload: InstallmentPlanCreate,
    current_user: User = Depends(require_owner_or_manager),
    db: Session = Depends(get_db),
) -> InstallmentPlan:
    client = ensure_client_write_access(db, current_user, client_id)

    if payload.pricing_tier_id is not None:
        tier = get_organization_pricing_tier(
            db,
            tier_id=payload.pricing_tier_id,
            organization_id=current_user.organization_id,
        )
    else:
        tier = find_pricing_tier(
            db,
            organization_id=current_user.organization_id,
            debt_amount=client.debt_amount,
            contract_date=client.contract_date,
        )
        if tier is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Не найден подходящий тариф",
            )

    start_date = payload.start_date or client.contract_date
    total_amount = payload.total_amount or tier.total_cost

    plan = InstallmentPlan(
        client_id=client.id,
        pricing_tier_id=tier.id,
        total_amount=total_amount,
        start_date=start_date,
        total_months=tier.total_months,
    )
    db.add(plan)
    db.flush()

    schedules = create_payment_schedule_models(
        pricing_tier=tier,
        start_date=start_date,
        installment_plan_id=plan.id,
    )
    db.add_all(schedules)

    log_audit(
        db,
        user=current_user,
        entity_type="installment_plan",
        entity_id=plan.id,
        action=AuditAction.CREATE,
    )
    db.commit()
    db.refresh(plan)
    return plan


@router.get(
    "/{client_id}/installment-plans/{plan_id}",
    response_model=InstallmentPlanResponse,
)
def get_installment_plan(
    client_id: UUID,
    plan_id: UUID,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> InstallmentPlan:
    if current_user.role == UserRole.CALL_CENTER:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Недостаточно прав")
    ensure_client_read_access(db, current_user, client_id)
    return get_installment_plan_for_client(db, plan_id=plan_id, client_id=client_id)
