from datetime import date
from decimal import Decimal

from sqlalchemy.orm import Session

from app.models.client_mandatory_payment import DEPOSIT_AMOUNT, ClientMandatoryPayment
from app.models.client_mandatory_payment_record import ClientMandatoryPaymentRecord
from app.models.enums import MandatoryPaymentStatus, MandatoryPaymentType


def build_mandatory_payment_response(item: ClientMandatoryPayment):
    from app.schemas.mandatory_payment import MandatoryPaymentRecordResponse, MandatoryPaymentResponse

    records = sorted(
        item.payment_records,
        key=lambda record: (record.payment_date, record.created_at),
        reverse=True,
    )
    return MandatoryPaymentResponse(
        id=item.id,
        client_id=item.client_id,
        payment_type=item.payment_type,
        planned_amount=item.planned_amount,
        paid_amount=item.paid_amount,
        paid_date=item.paid_date,
        status=item.status,
        is_applicable=item.is_applicable,
        comment=item.comment,
        payment_records=[MandatoryPaymentRecordResponse.model_validate(record) for record in records],
    )


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
    db: Session,
    item: ClientMandatoryPayment,
    amount: Decimal,
    payment_date: date,
) -> ClientMandatoryPaymentRecord:
    record = ClientMandatoryPaymentRecord(
        mandatory_payment_id=item.id,
        amount=amount,
        payment_date=payment_date,
    )
    db.add(record)

    item.paid_amount += amount
    item.paid_date = payment_date
    if item.planned_amount > Decimal("0.00") and item.paid_amount >= item.planned_amount:
        item.status = MandatoryPaymentStatus.PAID
        item.paid_date = payment_date
        item.paid_amount = item.planned_amount
    elif item.paid_amount > Decimal("0.00"):
        item.status = MandatoryPaymentStatus.PARTIAL
    else:
        item.status = MandatoryPaymentStatus.PENDING
        item.paid_date = None

    return record


def recalculate_mandatory_payment_from_records(item: ClientMandatoryPayment) -> None:
    records = sorted(item.payment_records, key=lambda record: (record.payment_date, record.created_at))
    item.paid_amount = sum((record.amount for record in records), Decimal("0.00"))
    item.paid_date = records[-1].payment_date if records else None
    refresh_mandatory_payment_status(item)


def delete_mandatory_payment_record(
    db: Session,
    item: ClientMandatoryPayment,
    record_id,
) -> None:
    record = next((entry for entry in item.payment_records if entry.id == record_id), None)
    if record is None:
        raise ValueError("record_not_found")
    item.payment_records = [entry for entry in item.payment_records if entry.id != record_id]
    db.delete(record)
    db.flush()
    recalculate_mandatory_payment_from_records(item)


def update_mandatory_payment_record(
    item: ClientMandatoryPayment,
    record_id,
    *,
    payment_date: date | None = None,
    amount: Decimal | None = None,
) -> ClientMandatoryPaymentRecord:
    record = next((entry for entry in item.payment_records if entry.id == record_id), None)
    if record is None:
        raise ValueError("record_not_found")
    if amount is not None:
        other_paid = item.paid_amount - record.amount
        remaining = item.planned_amount - other_paid
        if item.planned_amount > Decimal("0.00") and amount > remaining:
            raise ValueError("amount_exceeds_remaining")
        record.amount = amount
    if payment_date is not None:
        record.payment_date = payment_date
    recalculate_mandatory_payment_from_records(item)
    return record


def update_mandatory_payment_record_date(
    item: ClientMandatoryPayment,
    record_id,
    payment_date: date,
) -> ClientMandatoryPaymentRecord:
    return update_mandatory_payment_record(item, record_id, payment_date=payment_date)


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
