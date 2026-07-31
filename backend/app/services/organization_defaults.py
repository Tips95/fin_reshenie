import uuid
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.operating_expense import OperatingExpense
from app.models.pricing_tier import PricingTier
from app.services.default_operating_expenses import DEFAULT_OPERATING_EXPENSES
from app.services.default_pricing_tiers import DEFAULT_PRICING_TIERS


def sync_pricing_tiers(db: Session, organization_id: uuid.UUID) -> tuple[int, int]:
    """Досеивает стартовый шаблон тарифов, если у компании ещё нет сетки."""
    target_map = {
        (tier["min_amount"], tier["max_amount"]): tier for tier in DEFAULT_PRICING_TIERS
    }

    existing_tiers = list(
        db.scalars(select(PricingTier).where(PricingTier.organization_id == organization_id))
    )

    created = 0
    updated = 0

    for tier in existing_tiers:
        key = (tier.min_amount, tier.max_amount)
        if tier.min_amount < Decimal("300000"):
            db.delete(tier)
        elif key not in target_map:
            tier.is_active = False

    for tier_data in DEFAULT_PRICING_TIERS:
        key = (tier_data["min_amount"], tier_data["max_amount"])
        tier = db.scalar(
            select(PricingTier).where(
                PricingTier.organization_id == organization_id,
                PricingTier.min_amount == key[0],
                PricingTier.max_amount == key[1],
            )
        )
        if tier is None:
            db.add(
                PricingTier(
                    id=uuid.uuid4(),
                    organization_id=organization_id,
                    is_active=True,
                    **tier_data,
                )
            )
            created += 1
        else:
            for field, value in tier_data.items():
                setattr(tier, field, value)
            tier.is_active = True
            updated += 1

    db.flush()
    return created, updated


def sync_operating_expenses(db: Session, organization_id: uuid.UUID) -> tuple[int, int]:
    """Досеивает нейтральные статьи расходов, если у компании их ещё нет."""
    created = 0
    updated = 0

    for item in DEFAULT_OPERATING_EXPENSES:
        expense = db.scalar(
            select(OperatingExpense).where(
                OperatingExpense.organization_id == organization_id,
                OperatingExpense.name == item["name"],
            )
        )
        if expense is None:
            db.add(OperatingExpense(organization_id=organization_id, is_active=True, **item))
            created += 1
        elif not expense.is_active:
            # Не переписываем суммы и названия — только возвращаем шаблонную
            # статью в список, если её когда-то выключили и она совпала по имени.
            expense.is_active = True
            updated += 1

    db.flush()
    return created, updated


def seed_bankruptcy_organization_defaults(db: Session, organization_id: uuid.UUID) -> None:
    created, updated = sync_pricing_tiers(db, organization_id)
    sync_operating_expenses(db, organization_id)
    if created or updated:
        print(f"Pricing tiers synced: created={created}, updated={updated}")


def _has_active_pricing_tiers(db: Session, organization_id: uuid.UUID) -> bool:
    return bool(
        db.scalar(
            select(func.count())
            .select_from(PricingTier)
            .where(
                PricingTier.organization_id == organization_id,
                PricingTier.is_active.is_(True),
            )
        )
    )


def _has_operating_expenses(db: Session, organization_id: uuid.UUID) -> bool:
    return bool(
        db.scalar(
            select(func.count())
            .select_from(OperatingExpense)
            .where(OperatingExpense.organization_id == organization_id)
        )
    )


def seed_all_bankruptcy_organization_defaults(db: Session, *, force: bool = False) -> None:
    """Досеивает только то, чего у компании нет.

    Компании правят тарифы и статьи расходов под себя, поэтому переписывать их
    эталонной сеткой на каждом старте нельзя — правки откатывались бы после
    каждого деплоя. force=True оставлен как способ применить сетку заново
    вручную (переменная окружения FORCE_ORGANIZATION_DEFAULTS_SYNC).
    """
    from app.models.enums import OrganizationType
    from app.models.organization import Organization

    organizations = list(db.scalars(select(Organization)))
    for organization in organizations:
        org_type = getattr(organization, "organization_type", None)
        if org_type is None:
            organization.organization_type = OrganizationType.BANKRUPTCY
            org_type = OrganizationType.BANKRUPTCY
        if org_type != OrganizationType.BANKRUPTCY:
            continue

        if force:
            seed_bankruptcy_organization_defaults(db, organization.id)
            continue

        if not _has_active_pricing_tiers(db, organization.id):
            sync_pricing_tiers(db, organization.id)
        if not _has_operating_expenses(db, organization.id):
            sync_operating_expenses(db, organization.id)
