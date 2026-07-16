from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.payment import Payment
from app.models.payment_schedule import PaymentSchedule
from app.services.installment_schedule import recalculate_schedule_from_payments


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


def sync_schedule_from_payments(db: Session, schedule: PaymentSchedule) -> None:
    payments = get_active_schedule_payments(db, schedule.id)
    recalculate_schedule_from_payments(schedule, payments)
