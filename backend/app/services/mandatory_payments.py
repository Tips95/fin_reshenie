from datetime import date
from decimal import Decimal

from app.models.client_mandatory_payment import DEPOSIT_AMOUNT, ClientMandatoryPayment
from app.models.enums import MandatoryPaymentStatus, MandatoryPaymentType


def create_default_mandatory_payments(client_id) -> list[ClientMandatoryPayment]:
    return [
        ClientMandatoryPayment(
            client_id=client_id,
            payment_type=MandatoryPaymentType.DEPOSIT,
            planned_amount=DEPOSIT_AMOUNT,
            status=MandatoryPaymentStatus.PENDING,
            is_applicable=True,
        ),
        ClientMandatoryPayment(
            client_id=client_id,
            payment_type=MandatoryPaymentType.FINANCIAL_MANAGEMENT,
            planned_amount=Decimal("0.00"),
            status=MandatoryPaymentStatus.PENDING,
            is_applicable=True,
        ),
        ClientMandatoryPayment(
            client_id=client_id,
            payment_type=MandatoryPaymentType.COURT_FEE,
            planned_amount=Decimal("0.00"),
            status=MandatoryPaymentStatus.NOT_APPLICABLE,
            is_applicable=False,
        ),
    ]


def apply_mandatory_payment(
    item: ClientMandatoryPayment,
    amount: Decimal,
    payment_date: date,
) -> None:
    item.paid_amount += amount
    if item.planned_amount > Decimal("0.00") and item.paid_amount >= item.planned_amount:
        item.status = MandatoryPaymentStatus.PAID
        item.paid_date = payment_date
        item.paid_amount = item.planned_amount
    elif item.paid_amount > Decimal("0.00"):
        item.status = MandatoryPaymentStatus.PARTIAL
    else:
        item.status = MandatoryPaymentStatus.PENDING
        item.paid_date = None


def refresh_mandatory_payment_status(item: ClientMandatoryPayment) -> None:
    if not item.is_applicable:
        item.status = MandatoryPaymentStatus.NOT_APPLICABLE
        return

    if item.planned_amount <= Decimal("0.00"):
        if item.paid_amount > Decimal("0.00"):
            item.status = MandatoryPaymentStatus.PARTIAL
        else:
            item.status = MandatoryPaymentStatus.PENDING
        return

    if item.paid_amount >= item.planned_amount:
        item.status = MandatoryPaymentStatus.PAID
        item.paid_amount = item.planned_amount
    elif item.paid_amount > Decimal("0.00"):
        item.status = MandatoryPaymentStatus.PARTIAL
        item.paid_date = None
    else:
        item.status = MandatoryPaymentStatus.PENDING
        item.paid_date = None
