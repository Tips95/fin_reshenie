"""Кубышка: остаток кассы на начало месяца и перенос его в следующий месяц."""

from datetime import date
from decimal import Decimal
from uuid import UUID

from dateutil.relativedelta import relativedelta
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.cash_balance import CashBalance
from app.services.phone import month_bounds


def month_start_date(month: str) -> date:
    start, _ = month_bounds(month)
    return start


def next_month_key(month: str) -> str:
    return (month_start_date(month) + relativedelta(months=1)).strftime("%Y-%m")


def get_cash_balance(
    db: Session,
    organization_id: UUID,
    month: str,
) -> CashBalance | None:
    return db.scalar(
        select(CashBalance).where(
            CashBalance.organization_id == organization_id,
            CashBalance.period_month == month_start_date(month),
        )
    )


def set_cash_balance(
    db: Session,
    organization_id: UUID,
    month: str,
    *,
    opening_amount: Decimal,
    comment: str | None = None,
    updated_by: UUID | None = None,
) -> CashBalance:
    balance = get_cash_balance(db, organization_id, month)
    normalized_comment = comment.strip() if comment else None

    if balance is None:
        balance = CashBalance(
            organization_id=organization_id,
            period_month=month_start_date(month),
            opening_amount=opening_amount,
            comment=normalized_comment,
            updated_by=updated_by,
        )
        db.add(balance)
    else:
        balance.opening_amount = opening_amount
        balance.comment = normalized_comment
        balance.updated_by = updated_by

    db.flush()
    return balance
