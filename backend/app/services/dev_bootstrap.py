import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import inspect, select, text
from sqlalchemy.orm import Session

from app.core.database import SessionLocal, engine
from app.models import Base
import app.models  # noqa: F401
from app.models.client import Client
from app.models.client_mandatory_payment import ClientMandatoryPayment
from app.models.enums import ClientStatus, EngagementStage, ProcedureStage
from app.models.installment_plan import InstallmentPlan
from app.models.operating_expense import OperatingExpense
from app.models.pricing_tier import PricingTier
from app.models.user import User
from app.services.default_operating_expenses import DEFAULT_OPERATING_EXPENSES
from app.services.default_pricing_tiers import DEFAULT_PRICING_TIERS
from app.services.installment_schedule import create_payment_schedule_models
from app.services.mandatory_payments import create_default_mandatory_payments
from app.services.seed import seed_demo_user


def sync_pricing_tiers(db: Session, organization_id: uuid.UUID) -> tuple[int, int]:
    """Синхронизирует тарифы организации с актуальной сеткой «Решение»."""
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


def ensure_default_pricing_tiers(db: Session, organization_id: uuid.UUID) -> list[PricingTier]:
    created, _ = sync_pricing_tiers(db, organization_id)
    return list(
        db.scalars(
            select(PricingTier).where(
                PricingTier.organization_id == organization_id,
                PricingTier.is_active.is_(True),
            )
        )
    )[:created]


def seed_demo_client(db: Session, organization_id: uuid.UUID, manager_id: uuid.UUID) -> None:
    if db.scalar(select(Client).limit(1)) is not None:
        return

    tier = db.scalar(
        select(PricingTier)
        .where(
            PricingTier.organization_id == organization_id,
            PricingTier.min_amount <= Decimal("350000.00"),
            PricingTier.max_amount >= Decimal("350000.00"),
        )
        .limit(1)
    )
    if tier is None:
        return

    client = Client(
        id=uuid.uuid4(),
        organization_id=organization_id,
        assigned_manager_id=manager_id,
        full_name="Иванов Иван Иванович",
        phone="+79991234567",
        contract_date=date(2026, 7, 1),
        debt_amount=Decimal("350000.00"),
        status=ClientStatus.ACTIVE,
        engagement_stage=EngagementStage.BANKRUPTCY,
        procedure_stage=ProcedureStage.CONTRACT_SIGNED,
    )
    db.add(client)
    db.flush()

    plan = InstallmentPlan(
        id=uuid.uuid4(),
        client_id=client.id,
        pricing_tier_id=tier.id,
        total_amount=tier.total_cost,
        start_date=client.contract_date,
        total_months=tier.total_months,
    )
    db.add(plan)
    db.flush()
    db.add_all(
        create_payment_schedule_models(
            pricing_tier=tier,
            start_date=client.contract_date,
            installment_plan_id=plan.id,
        )
    )
    db.add_all(create_default_mandatory_payments(client.id))


def sync_operating_expenses(db: Session, organization_id: uuid.UUID) -> tuple[int, int]:
    """Синхронизирует статьи расходов с актуальным списком компании."""
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
        else:
            changed = False
            for field, value in item.items():
                if getattr(expense, field) != value:
                    setattr(expense, field, value)
                    changed = True
            if not expense.is_active:
                expense.is_active = True
                changed = True
            if changed:
                updated += 1

    db.flush()
    return created, updated


def seed_operating_expenses(db: Session, organization_id: uuid.UUID) -> int:
    created, _ = sync_operating_expenses(db, organization_id)
    return created


def backfill_mandatory_payments(db: Session) -> int:
    clients = list(db.scalars(select(Client).where(Client.is_deleted.is_(False))))
    created = 0
    for client in clients:
        existing = db.scalar(
            select(ClientMandatoryPayment)
            .where(ClientMandatoryPayment.client_id == client.id)
            .limit(1)
        )
        if existing is None:
            db.add_all(create_default_mandatory_payments(client.id))
            created += 1
    return created


def ensure_schema_updates() -> None:
    """Добавляет новые колонки в существующую локальную SQLite без полного сброса."""
    inspector = inspect(engine)
    if not inspector.has_table("payments"):
        return

    columns = {column["name"] for column in inspector.get_columns("payments")}
    if "is_refund" not in columns:
        with engine.begin() as conn:
            conn.execute(
                text("ALTER TABLE payments ADD COLUMN is_refund BOOLEAN NOT NULL DEFAULT 0")
            )


def bootstrap() -> None:
    Base.metadata.create_all(bind=engine)
    ensure_schema_updates()
    db = SessionLocal()
    try:
        seed_demo_user(db)
        user = db.scalar(select(User).limit(1))
        if user is None:
            raise RuntimeError("Не удалось создать тестового пользователя")

        created, updated = sync_pricing_tiers(db, user.organization_id)
        expenses_created, expenses_updated = sync_operating_expenses(db, user.organization_id)
        mandatory_created = backfill_mandatory_payments(db)
        seed_demo_client(db, user.organization_id, user.id)

        db.commit()
        print("Локальная БД готова")
        print(f"Тарифов: добавлено {created}, обновлено {updated}, всего активных {len(DEFAULT_PRICING_TIERS)}")
        print(f"Ежемесячных расходов: добавлено {expenses_created}, обновлено {expenses_updated}")
        print(f"Обязательных платежей у клиентов: добавлено {mandatory_created}")
        print("Логин: admin@reshenie.local / admin123")
    finally:
        db.close()


if __name__ == "__main__":
    bootstrap()
