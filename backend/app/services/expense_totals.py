from datetime import date
from decimal import Decimal
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.expense_payment import ExpensePayment
from app.models.one_time_expense import OneTimeExpense
from app.models.operating_expense import OperatingExpense


def fixed_monthly_expenses_total(db: Session, organization_id: UUID) -> Decimal:
    return db.scalar(
        select(func.coalesce(func.sum(OperatingExpense.amount), 0)).where(
            OperatingExpense.organization_id == organization_id,
            OperatingExpense.is_active.is_(True),
        )
    ) or Decimal("0.00")


def one_time_expenses_total(
    db: Session,
    organization_id: UUID,
    *,
    month_start: date,
    month_end: date,
) -> Decimal:
    return db.scalar(
        select(func.coalesce(func.sum(OneTimeExpense.amount), 0)).where(
            OneTimeExpense.organization_id == organization_id,
            OneTimeExpense.period_month >= month_start,
            OneTimeExpense.period_month <= month_end,
        )
    ) or Decimal("0.00")


def paid_fixed_expenses_total(
    db: Session,
    organization_id: UUID,
    *,
    month_start: date,
    month_end: date,
) -> Decimal:
    """Фактически закрытые плановые статьи за месяц — в отличие от бюджета."""
    return db.scalar(
        select(func.coalesce(func.sum(ExpensePayment.amount), 0))
        .join(OperatingExpense, OperatingExpense.id == ExpensePayment.expense_id)
        .where(
            OperatingExpense.organization_id == organization_id,
            ExpensePayment.period_month >= month_start,
            ExpensePayment.period_month <= month_end,
        )
    ) or Decimal("0.00")


def monthly_expenses_total(
    db: Session,
    organization_id: UUID,
    *,
    month_start: date,
    month_end: date,
) -> tuple[Decimal, Decimal, Decimal]:
    fixed = fixed_monthly_expenses_total(db, organization_id)
    one_time = one_time_expenses_total(
        db,
        organization_id,
        month_start=month_start,
        month_end=month_end,
    )
    return fixed + one_time, fixed, one_time
