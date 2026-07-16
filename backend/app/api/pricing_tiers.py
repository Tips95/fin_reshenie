from types import SimpleNamespace
from uuid import UUID
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import require_owner
from app.core.database import get_db
from app.models.enums import AuditAction
from app.models.pricing_tier import PricingTier
from app.models.user import User
from app.schemas.pricing_tier import (
    PricingTierCreate,
    PricingTierResponse,
    PricingTierUpdate,
)
from app.services.access import get_organization_pricing_tier
from app.services.audit import log_audit
from app.services.installment_schedule import build_payment_schedule_entries

router = APIRouter()


def _validate_tier_payload(data: dict) -> None:
    min_amount = data["min_amount"]
    max_amount = data["max_amount"]
    if min_amount >= max_amount:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="min_amount < max_amount")

    total_months = data["total_months"]
    remaining_months_count = data["remaining_months_count"]
    if total_months != 2 + remaining_months_count:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="total_months должен равняться 2 + remaining_months_count",
        )

    tier = SimpleNamespace(
        first_month_payment=data["first_month_payment"],
        second_month_payment=data["second_month_payment"],
        remaining_months_count=remaining_months_count,
        remaining_month_payment=data["remaining_month_payment"],
        total_months=total_months,
        total_cost=data["total_cost"],
    )
    build_payment_schedule_entries(pricing_tier=tier, start_date=data["effective_from"])


@router.get("", response_model=list[PricingTierResponse])
def list_pricing_tiers(
    current_user: User = Depends(require_owner),
    db: Session = Depends(get_db),
) -> list[PricingTier]:
    stmt = (
        select(PricingTier)
        .where(
            PricingTier.organization_id == current_user.organization_id,
            PricingTier.is_active.is_(True),
            PricingTier.min_amount >= Decimal("300000"),
        )
        .order_by(PricingTier.min_amount)
    )
    return list(db.scalars(stmt))


@router.post("", response_model=PricingTierResponse, status_code=status.HTTP_201_CREATED)
def create_pricing_tier(
    payload: PricingTierCreate,
    current_user: User = Depends(require_owner),
    db: Session = Depends(get_db),
) -> PricingTier:
    data = payload.model_dump()
    _validate_tier_payload(data)

    tier = PricingTier(organization_id=current_user.organization_id, **data)
    db.add(tier)
    db.flush()

    log_audit(
        db,
        user=current_user,
        entity_type="pricing_tier",
        entity_id=tier.id,
        action=AuditAction.CREATE,
    )
    db.commit()
    db.refresh(tier)
    return tier


@router.get("/{tier_id}", response_model=PricingTierResponse)
def get_pricing_tier(
    tier_id: UUID,
    current_user: User = Depends(require_owner),
    db: Session = Depends(get_db),
) -> PricingTier:
    return get_organization_pricing_tier(
        db, tier_id=tier_id, organization_id=current_user.organization_id
    )


@router.patch("/{tier_id}", response_model=PricingTierResponse)
def update_pricing_tier(
    tier_id: UUID,
    payload: PricingTierUpdate,
    current_user: User = Depends(require_owner),
    db: Session = Depends(get_db),
) -> PricingTier:
    tier = get_organization_pricing_tier(
        db, tier_id=tier_id, organization_id=current_user.organization_id
    )
    updates = payload.model_dump(exclude_unset=True)
    merged = {
        "min_amount": updates.get("min_amount", tier.min_amount),
        "max_amount": updates.get("max_amount", tier.max_amount),
        "total_cost": updates.get("total_cost", tier.total_cost),
        "first_month_payment": updates.get("first_month_payment", tier.first_month_payment),
        "second_month_payment": updates.get("second_month_payment", tier.second_month_payment),
        "remaining_months_count": updates.get("remaining_months_count", tier.remaining_months_count),
        "remaining_month_payment": updates.get("remaining_month_payment", tier.remaining_month_payment),
        "total_months": updates.get("total_months", tier.total_months),
        "is_active": updates.get("is_active", tier.is_active),
        "effective_from": updates.get("effective_from", tier.effective_from),
    }
    _validate_tier_payload(merged)

    for field, value in updates.items():
        old_value = getattr(tier, field)
        if old_value != value:
            log_audit(
                db,
                user=current_user,
                entity_type="pricing_tier",
                entity_id=tier.id,
                action=AuditAction.UPDATE,
                field_name=field,
                old_value=old_value,
                new_value=value,
            )
            setattr(tier, field, value)

    db.commit()
    db.refresh(tier)
    return tier
