from decimal import Decimal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.enums import PaymentScheduleStatus
from app.models.installment_plan import InstallmentPlan
from app.models.payment import Payment
from app.models.payment_schedule import PaymentSchedule


def get_active_schedule_payments(db: Session, schedule_id: UUID) -> list[Payment]:
    return list(
        db.scalars(
            select(Payment)
            .where(
                Payment.payment_schedule_id == schedule_id,
                Payment.is_deleted.is_(False),
            )
            .order_by(Payment.payment_date, Payment.created_at)
        )
    )


def _set_schedule_status(schedule: PaymentSchedule, payment_date) -> None:
    if schedule.paid_amount >= schedule.planned_amount:
        schedule.status = PaymentScheduleStatus.PAID
        schedule.paid_date = payment_date
        schedule.paid_amount = schedule.planned_amount
    elif schedule.paid_amount > Decimal("0.00"):
        schedule.status = PaymentScheduleStatus.PARTIAL
        schedule.paid_date = None
    else:
        schedule.status = PaymentScheduleStatus.PENDING
        schedule.paid_date = None


def _apply_amount_to_schedules(
    schedules: list[PaymentSchedule],
    amount: Decimal,
    payment_date,
    *,
    start_schedule_id: UUID | None = None,
) -> Decimal:
    """Распределяет сумму по месяцам графика, начиная с указанного или с первого."""
    remaining = amount
    started = start_schedule_id is None

    for schedule in schedules:
        if not started:
            if schedule.id == start_schedule_id:
                started = True
            else:
                continue
        if remaining <= Decimal("0.00"):
            break

        item_remainder = schedule.planned_amount - schedule.paid_amount
        if item_remainder <= Decimal("0.00"):
            continue

        applied = min(remaining, item_remainder)
        schedule.paid_amount += applied
        remaining -= applied
        _set_schedule_status(schedule, payment_date)

    return remaining


def sync_client_payment_schedules(db: Session, client_id: UUID) -> None:
    """Пересчитывает весь график клиента по истории платежей."""
    plan = db.scalar(
        select(InstallmentPlan)
        .where(InstallmentPlan.client_id == client_id)
        .order_by(InstallmentPlan.created_at.desc())
    )
    if plan is None:
        return

    schedules = list(
        db.scalars(
            select(PaymentSchedule)
            .where(PaymentSchedule.installment_plan_id == plan.id)
            .order_by(PaymentSchedule.month_number)
        )
    )
    if not schedules:
        return

    for schedule in schedules:
        schedule.paid_amount = Decimal("0.00")
        schedule.status = PaymentScheduleStatus.PENDING
        schedule.paid_date = None

    payments = list(
        db.scalars(
            select(Payment)
            .where(
                Payment.client_id == client_id,
                Payment.is_deleted.is_(False),
            )
            .order_by(Payment.payment_date, Payment.created_at)
        )
    )

    for payment in payments:
        if payment.is_refund:
            if payment.payment_schedule_id is not None:
                schedule = next(
                    (item for item in schedules if item.id == payment.payment_schedule_id),
                    None,
                )
                if schedule is not None:
                    schedule.paid_amount = max(
                        Decimal("0.00"),
                        schedule.paid_amount - payment.amount,
                    )
                    _set_schedule_status(schedule, payment.payment_date)
            continue

        _apply_amount_to_schedules(
            schedules,
            payment.amount,
            payment.payment_date,
            start_schedule_id=payment.payment_schedule_id,
        )


def sync_schedule_from_payments(db: Session, schedule: PaymentSchedule) -> None:
    client_id = schedule.installment_plan.client_id
    sync_client_payment_schedules(db, client_id)
