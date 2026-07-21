from datetime import date
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.client import Client
from app.models.client_mandatory_payment import ClientMandatoryPayment
from app.models.client_mandatory_payment_record import ClientMandatoryPaymentRecord
from app.models.payment import Payment
from app.models.payment_schedule import PaymentSchedule
from app.services.payment_sync import sync_client_payment_schedules
from app.services.schedule_dates import effective_due_date


def align_client_payment_dates(db: Session, client: Client) -> tuple[int, int]:
    schedule_updated = _align_schedule_payments(db, client.id)
    mandatory_updated = _align_mandatory_records(db, client)
    sync_client_payment_schedules(db, client.id)
    return schedule_updated, mandatory_updated


def _align_schedule_payments(db: Session, client_id: UUID) -> int:
    payments = list(
        db.scalars(
            select(Payment).where(
                Payment.client_id == client_id,
                Payment.is_deleted.is_(False),
                Payment.is_refund.is_(False),
                Payment.payment_schedule_id.is_not(None),
            )
        )
    )
    if not payments:
        return 0

    schedule_ids = {payment.payment_schedule_id for payment in payments}
    schedules = {
        schedule.id: schedule
        for schedule in db.scalars(
            select(PaymentSchedule).where(PaymentSchedule.id.in_(schedule_ids))
        )
    }

    updated = 0
    for payment in payments:
        schedule = schedules.get(payment.payment_schedule_id)
        if schedule is None:
            continue
        target_date = effective_due_date(schedule)
        if payment.payment_date != target_date:
            payment.payment_date = target_date
            updated += 1

    return updated


def _align_mandatory_records(db: Session, client: Client) -> int:
    records = list(
        db.scalars(
            select(ClientMandatoryPaymentRecord)
            .join(
                ClientMandatoryPayment,
                ClientMandatoryPayment.id == ClientMandatoryPaymentRecord.mandatory_payment_id,
            )
            .where(ClientMandatoryPayment.client_id == client.id)
        )
    )
    if not records:
        return 0

    updated = 0
    for record in records:
        if record.payment_date != client.contract_date:
            record.payment_date = client.contract_date
            updated += 1

    mandatory_items = list(
        db.scalars(
            select(ClientMandatoryPayment).where(ClientMandatoryPayment.client_id == client.id)
        )
    )
    for item in mandatory_items:
        if item.paid_amount <= 0:
            item.paid_date = None
            continue
        latest_paid_date = db.scalar(
            select(func.max(ClientMandatoryPaymentRecord.payment_date)).where(
                ClientMandatoryPaymentRecord.mandatory_payment_id == item.id
            )
        )
        item.paid_date = latest_paid_date

    return updated
