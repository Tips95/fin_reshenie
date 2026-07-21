from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.client_mandatory_payment import ClientMandatoryPayment
from app.models.client_mandatory_payment_record import ClientMandatoryPaymentRecord
from app.models.enums import MandatoryPaymentType


@dataclass(frozen=True)
class MandatoryPaymentTotals:
    deposit: Decimal
    financial_management: Decimal
    court_fee: Decimal

    @property
    def total(self) -> Decimal:
        return self.deposit + self.financial_management + self.court_fee


def _empty_totals() -> MandatoryPaymentTotals:
    zero = Decimal("0.00")
    return MandatoryPaymentTotals(deposit=zero, financial_management=zero, court_fee=zero)


def get_mandatory_paid_totals(
    db: Session,
    client_ids: list[UUID],
    *,
    date_from: date | None = None,
    date_to: date | None = None,
) -> MandatoryPaymentTotals:
    if not client_ids:
        return _empty_totals()

    stmt = (
        select(ClientMandatoryPayment.payment_type, ClientMandatoryPaymentRecord.amount)
        .join(
            ClientMandatoryPaymentRecord,
            ClientMandatoryPaymentRecord.mandatory_payment_id == ClientMandatoryPayment.id,
        )
        .where(
            ClientMandatoryPayment.client_id.in_(client_ids),
            ClientMandatoryPayment.is_applicable.is_(True),
        )
    )
    if date_from is not None:
        stmt = stmt.where(ClientMandatoryPaymentRecord.payment_date >= date_from)
    if date_to is not None:
        stmt = stmt.where(ClientMandatoryPaymentRecord.payment_date <= date_to)

    rows = list(db.execute(stmt))
    if rows:
        mutable = {
            MandatoryPaymentType.DEPOSIT: Decimal("0.00"),
            MandatoryPaymentType.FINANCIAL_MANAGEMENT: Decimal("0.00"),
            MandatoryPaymentType.COURT_FEE: Decimal("0.00"),
        }
        for payment_type, amount in rows:
            mutable[payment_type] += amount
        return MandatoryPaymentTotals(
            deposit=mutable[MandatoryPaymentType.DEPOSIT],
            financial_management=mutable[MandatoryPaymentType.FINANCIAL_MANAGEMENT],
            court_fee=mutable[MandatoryPaymentType.COURT_FEE],
        )

    # Fallback for legacy data without payment records.
    stmt = select(ClientMandatoryPayment).where(
        ClientMandatoryPayment.client_id.in_(client_ids),
        ClientMandatoryPayment.is_applicable.is_(True),
    )
    if date_from is not None or date_to is not None:
        if date_from is not None:
            stmt = stmt.where(
                ClientMandatoryPayment.paid_date.is_not(None),
                ClientMandatoryPayment.paid_date >= date_from,
            )
        if date_to is not None:
            stmt = stmt.where(ClientMandatoryPayment.paid_date <= date_to)

    mutable = {
        MandatoryPaymentType.DEPOSIT: Decimal("0.00"),
        MandatoryPaymentType.FINANCIAL_MANAGEMENT: Decimal("0.00"),
        MandatoryPaymentType.COURT_FEE: Decimal("0.00"),
    }
    for item in db.scalars(stmt):
        mutable[item.payment_type] += item.paid_amount

    return MandatoryPaymentTotals(
        deposit=mutable[MandatoryPaymentType.DEPOSIT],
        financial_management=mutable[MandatoryPaymentType.FINANCIAL_MANAGEMENT],
        court_fee=mutable[MandatoryPaymentType.COURT_FEE],
    )


def breakdown_from_totals(totals: MandatoryPaymentTotals) -> "MandatoryPaymentBreakdown":
    from app.schemas.dashboard import MandatoryPaymentBreakdown

    return MandatoryPaymentBreakdown(
        deposit=totals.deposit,
        financial_management=totals.financial_management,
        court_fee=totals.court_fee,
        total=totals.total,
    )
