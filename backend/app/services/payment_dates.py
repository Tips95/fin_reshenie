from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.client import Client
from app.models.client_mandatory_payment import ClientMandatoryPayment
from app.models.client_mandatory_payment_record import ClientMandatoryPaymentRecord
from app.models.installment_plan import InstallmentPlan
from app.models.payment import Payment
from app.models.payment_schedule import PaymentSchedule
from app.services.payment_sync import sync_client_payment_schedules
from app.services.schedule_dates import effective_due_date, find_schedule_by_payment_month
from app.services.schedule_rebuild import rebuild_schedule_dates_from_contract


def realign_client_legacy_finances(db: Session, client: Client) -> tuple[int, int, int]:
    schedule_dates_updated = rebuild_schedule_dates_from_contract(db, client)
    sync_client_payment_schedules(db, client.id)
    schedule_payments_updated = _align_schedule_payment_dates(db, client.id)
    mandatory_updated = _align_mandatory_records(db, client)
    return schedule_dates_updated, schedule_payments_updated, mandatory_updated


def align_client_payment_dates(db: Session, client: Client) -> tuple[int, int]:
    _, schedule_updated, mandatory_updated = realign_client_legacy_finances(db, client)
    return schedule_updated, mandatory_updated


def _client_schedules(db: Session, client_id: UUID) -> list[PaymentSchedule]:
    plan = db.scalar(
        select(InstallmentPlan)
        .where(InstallmentPlan.client_id == client_id)
        .order_by(InstallmentPlan.created_at.desc())
    )
    if plan is None:
        return []

    return list(
        db.scalars(
            select(PaymentSchedule)
            .where(PaymentSchedule.installment_plan_id == plan.id)
            .order_by(PaymentSchedule.month_number)
        )
    )


def _align_schedule_payment_dates(db: Session, client_id: UUID) -> int:
    payments = list(
        db.scalars(
            select(Payment).where(
                Payment.client_id == client_id,
                Payment.is_deleted.is_(False),
                Payment.is_refund.is_(False),
            )
        )
    )
    if not payments:
        return 0

    schedules = _client_schedules(db, client_id)
    schedules_by_id = {schedule.id: schedule for schedule in schedules}

    updated = 0
    for payment in payments:
        schedule = None
        if payment.payment_schedule_id is not None:
            schedule = schedules_by_id.get(payment.payment_schedule_id)
        if schedule is None:
            schedule = find_schedule_by_payment_month(schedules, payment.payment_date)
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
