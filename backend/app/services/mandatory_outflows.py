"""Помесячные выплаты депозита и финансового управления."""

from datetime import date
from decimal import Decimal
from dateutil.relativedelta import relativedelta
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.client import Client
from app.models.client_mandatory_payment import ClientMandatoryPayment
from app.models.client_mandatory_payment_record import ClientMandatoryPaymentRecord
from app.models.enums import MandatoryPaymentType
from app.models.user import User
from app.schemas.mandatory_outflows import (
    MandatoryOutflowItem,
    MandatoryOutflowMonth,
    MandatoryOutflowsOverview,
)
from app.services.phone import month_bounds

TRACKED_TYPES = (
    MandatoryPaymentType.DEPOSIT,
    MandatoryPaymentType.FINANCIAL_MANAGEMENT,
)
HISTORY_MONTHS = 12


def _month_key(day: date) -> str:
    return f"{day.year:04d}-{day.month:02d}"


def _empty_month(month: str) -> MandatoryOutflowMonth:
    zero = Decimal("0.00")
    return MandatoryOutflowMonth(
        month=month,
        deposit=zero,
        financial_management=zero,
        total=zero,
    )


def _history_keys(month: str) -> list[str]:
    start, _ = month_bounds(month)
    first = start - relativedelta(months=HISTORY_MONTHS - 1)
    keys: list[str] = []
    cursor = first
    for _ in range(HISTORY_MONTHS):
        keys.append(_month_key(cursor))
        cursor = cursor + relativedelta(months=1)
    return keys


def get_mandatory_outflows_overview(
    db: Session,
    user: User,
    *,
    month: str,
) -> MandatoryOutflowsOverview:
    keys = _history_keys(month)
    window_start, _ = month_bounds(keys[0])
    _, window_end = month_bounds(keys[-1])

    rows = db.execute(
        select(
            Client.id,
            Client.full_name,
            ClientMandatoryPayment.payment_type,
            ClientMandatoryPaymentRecord.amount,
            ClientMandatoryPaymentRecord.payment_date,
        )
        .join(
            ClientMandatoryPaymentRecord,
            ClientMandatoryPaymentRecord.mandatory_payment_id == ClientMandatoryPayment.id,
        )
        .join(Client, Client.id == ClientMandatoryPayment.client_id)
        .where(
            Client.organization_id == user.organization_id,
            Client.is_deleted.is_(False),
            ClientMandatoryPayment.is_applicable.is_(True),
            ClientMandatoryPayment.payment_type.in_(TRACKED_TYPES),
            ClientMandatoryPaymentRecord.payment_date >= window_start,
            ClientMandatoryPaymentRecord.payment_date <= window_end,
        )
        .order_by(
            ClientMandatoryPaymentRecord.payment_date.desc(),
            Client.full_name.asc(),
        )
    ).all()

    by_month = {key: _empty_month(key) for key in keys}
    items: list[MandatoryOutflowItem] = []
    for client_id, client_name, payment_type, amount, payment_date in rows:
        type_value = payment_type.value if isinstance(payment_type, MandatoryPaymentType) else str(payment_type)
        if type_value not in {"deposit", "financial_management"}:
            continue
        key = _month_key(payment_date)
        bucket = by_month.get(key)
        if bucket is None:
            continue
        if type_value == "deposit":
            bucket.deposit += amount
        else:
            bucket.financial_management += amount
        bucket.total = bucket.deposit + bucket.financial_management
        if key == month:
            items.append(
                MandatoryOutflowItem(
                    client_id=client_id,
                    client_name=client_name,
                    payment_type=type_value,
                    amount=amount,
                    payment_date=payment_date,
                )
            )

    selected = by_month[month]
    return MandatoryOutflowsOverview(
        month=month,
        deposit=selected.deposit,
        financial_management=selected.financial_management,
        total=selected.total,
        items=items,
        history=list(by_month.values()),
    )
