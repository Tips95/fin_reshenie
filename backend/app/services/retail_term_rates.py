from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.retail_term_rate import RetailTermRate

DEFAULT_RETAIL_TERM_RATES: list[tuple[int, Decimal]] = [
    (6, Decimal("30.00")),
    (7, Decimal("35.00")),
    (8, Decimal("40.00")),
    (9, Decimal("45.00")),
    (10, Decimal("50.00")),
    (11, Decimal("55.00")),
    (12, Decimal("60.00")),
]


def sync_default_term_rates(db: Session, organization_id) -> None:
    existing = {
        row.term_months
        for row in db.scalars(
            select(RetailTermRate).where(RetailTermRate.organization_id == organization_id)
        )
    }
    for term_months, markup_percent in DEFAULT_RETAIL_TERM_RATES:
        if term_months in existing:
            continue
        db.add(
            RetailTermRate(
                organization_id=organization_id,
                term_months=term_months,
                markup_percent=markup_percent,
                is_active=True,
            )
        )


def get_markup_percent(db: Session, organization_id, term_months: int) -> Decimal:
    rate = db.scalar(
        select(RetailTermRate).where(
            RetailTermRate.organization_id == organization_id,
            RetailTermRate.term_months == term_months,
            RetailTermRate.is_active.is_(True),
        )
    )
    if rate is None:
        raise ValueError(f"Тариф для срока {term_months} месяцев не найден")
    return rate.markup_percent
