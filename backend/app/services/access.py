from calendar import monthrange
from collections import defaultdict
from datetime import date
from decimal import Decimal
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import Select, and_, func, or_, select
from sqlalchemy.orm import Session

from app.models.client import Client
from app.models.enums import ClientStatus, EngagementStage, OrganizationType, PaymentScheduleStatus, UserRole
from app.models.installment_plan import InstallmentPlan
from app.models.organization import Organization
from app.models.payment_schedule import PaymentSchedule
from app.models.pricing_tier import PricingTier
from app.models.user import User
from app.services.default_pricing_tiers import MIN_DEBT_AMOUNT
from app.services.organization_defaults import sync_pricing_tiers
from app.services.schedule_dates import is_schedule_overdue


def get_organization_client(
    db: Session,
    *,
    client_id: UUID,
    organization_id: UUID,
    include_deleted: bool = False,
) -> Client:
    client = db.get(Client, client_id)
    if client is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Клиент не найден")
    if client.organization_id != organization_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Клиент не найден")
    if client.is_deleted and not include_deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Клиент не найден")
    return client


def manager_can_access_client(client: Client, user: User) -> bool:
    if client.assigned_manager_id == user.id:
        return True
    return (
        client.assigned_manager_id is None
        and client.engagement_stage == EngagementStage.DOCUMENT_COLLECTION
    )


def ensure_client_read_access(db: Session, user: User, client_id: UUID) -> Client:
    client = get_organization_client(db, client_id=client_id, organization_id=user.organization_id)
    if user.role == UserRole.MANAGER and not manager_can_access_client(client, user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Нет доступа к клиенту")
    return client


def ensure_client_write_access(db: Session, user: User, client_id: UUID) -> Client:
    if user.role == UserRole.CALL_CENTER:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Недостаточно прав")
    return ensure_client_read_access(db, user, client_id)


def apply_client_visibility_filter(stmt: Select, user: User) -> Select:
    stmt = stmt.where(Client.organization_id == user.organization_id, Client.is_deleted.is_(False))
    if user.role == UserRole.MANAGER:
        stmt = stmt.where(
            or_(
                Client.assigned_manager_id == user.id,
                and_(
                    Client.assigned_manager_id.is_(None),
                    Client.engagement_stage == EngagementStage.DOCUMENT_COLLECTION,
                ),
            )
        )
    return stmt


def _pricing_tier_lookup_stmt(
    *,
    organization_id: UUID,
    debt_amount: Decimal,
    contract_date: date,
):
    return (
        select(PricingTier)
        .where(
            PricingTier.organization_id == organization_id,
            PricingTier.is_active.is_(True),
            PricingTier.min_amount >= MIN_DEBT_AMOUNT,
            PricingTier.min_amount <= debt_amount,
            PricingTier.max_amount >= debt_amount,
            PricingTier.effective_from <= contract_date,
        )
        .order_by(
            PricingTier.effective_from.desc(),
            PricingTier.min_amount.asc(),
        )
        .limit(1)
    )


def _ensure_default_pricing_tiers(db: Session, organization_id: UUID) -> None:
    active_count = db.scalar(
        select(func.count())
        .select_from(PricingTier)
        .where(
            PricingTier.organization_id == organization_id,
            PricingTier.is_active.is_(True),
        )
    )
    if active_count:
        return

    organization = db.get(Organization, organization_id)
    if organization is None:
        return

    org_type = getattr(organization, "organization_type", None)
    if org_type is None:
        organization.organization_type = OrganizationType.BANKRUPTCY
    elif org_type != OrganizationType.BANKRUPTCY:
        return

    created, updated = sync_pricing_tiers(db, organization_id)
    if created or updated:
        print(
            f"Auto-synced pricing tiers for org {organization_id}: "
            f"created={created}, updated={updated}"
        )


def find_pricing_tier(
    db: Session,
    *,
    organization_id: UUID,
    debt_amount: Decimal,
    contract_date: date,
) -> PricingTier | None:
    """
    Подбор тарифа по сумме долга.

    Диапазоны из прайса включительные: «300к – 400к» значит
    min_amount <= долг <= max_amount. На границе (ровно 400к) берётся
    нижний диапазон (300–400), а не следующий (400–500).
    """
    stmt = _pricing_tier_lookup_stmt(
        organization_id=organization_id,
        debt_amount=debt_amount,
        contract_date=contract_date,
    )
    tier = db.scalar(stmt)
    if tier is not None:
        return tier

    _ensure_default_pricing_tiers(db, organization_id)
    return db.scalar(stmt)


def pricing_tier_not_found_message(
    db: Session,
    *,
    organization_id: UUID,
    debt_amount: Decimal,
    contract_date: date,
) -> str:
    tiers = list(
        db.scalars(
            select(PricingTier)
            .where(
                PricingTier.organization_id == organization_id,
                PricingTier.is_active.is_(True),
            )
            .order_by(PricingTier.min_amount)
        )
    )

    if not tiers:
        return (
            "Не найден подходящий тариф: в организации нет активных тарифов. "
            "Добавьте тарифную сетку в разделе «Тарифы»."
        )

    ranges = ", ".join(
        f"{tier.min_amount}–{tier.max_amount} ₽ (с {tier.effective_from:%d.%m.%Y})"
        for tier in tiers
    )
    return (
        f"Не найден тариф для суммы долга {debt_amount} ₽ и даты договора {contract_date:%d.%m.%Y}. "
        f"Банкротство оформляется при долге от {MIN_DEBT_AMOUNT} ₽. "
        f"Сумма долга должна попадать в один из диапазонов включительно. "
        f"Доступные диапазоны: {ranges}"
    )


def get_organization_pricing_tier(
    db: Session,
    *,
    tier_id: UUID,
    organization_id: UUID,
) -> PricingTier:
    tier = db.get(PricingTier, tier_id)
    if tier is None or tier.organization_id != organization_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Тариф не найден")
    return tier


def get_organization_user(db: Session, *, user_id: UUID, organization_id: UUID) -> User:
    user = db.get(User, user_id)
    if user is None or user.organization_id != organization_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Пользователь не найден")
    return user


def get_installment_plan_for_client(
    db: Session,
    *,
    plan_id: UUID,
    client_id: UUID,
) -> InstallmentPlan:
    plan = db.get(InstallmentPlan, plan_id)
    if plan is None or plan.client_id != client_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="График рассрочки не найден")
    return plan


def clients_overdue_map(
    db: Session,
    client_ids: list[UUID],
    *,
    today: date | None = None,
) -> dict[UUID, bool]:
    if not client_ids:
        return {}

    check_date = today or date.today()
    schedules_by_client: dict[UUID, list[PaymentSchedule]] = defaultdict(list)

    rows = db.execute(
        select(InstallmentPlan.client_id, PaymentSchedule)
        .join(PaymentSchedule, PaymentSchedule.installment_plan_id == InstallmentPlan.id)
        .where(InstallmentPlan.client_id.in_(client_ids))
    )
    for client_id, schedule in rows:
        schedules_by_client[client_id].append(schedule)

    return {
        client_id: any(is_schedule_overdue(schedule, check_date) for schedule in schedules_by_client[client_id])
        for client_id in client_ids
    }


def client_has_overdue_payments(db: Session, client_id: UUID) -> bool:
    return clients_overdue_map(db, [client_id]).get(client_id, False)
