from datetime import date
from decimal import Decimal
from uuid import UUID

from dateutil.relativedelta import relativedelta
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.enums import PaymentScheduleStatus
from app.models.installment_plan import InstallmentPlan
from app.models.payment_schedule import PaymentSchedule


def _refresh_schedule_status(schedule: PaymentSchedule) -> None:
    if schedule.paid_amount >= schedule.planned_amount and schedule.planned_amount > Decimal("0.00"):
        schedule.status = PaymentScheduleStatus.PAID
    elif schedule.paid_amount > Decimal("0.00"):
        schedule.status = PaymentScheduleStatus.PARTIAL
        schedule.paid_date = None
    elif schedule.status != PaymentScheduleStatus.OVERDUE:
        schedule.status = PaymentScheduleStatus.PENDING
        schedule.paid_date = None


def _sync_plan_totals(db: Session, plan: InstallmentPlan) -> None:
    schedules = list(
        db.scalars(
            select(PaymentSchedule)
            .where(PaymentSchedule.installment_plan_id == plan.id)
            .order_by(PaymentSchedule.month_number)
        )
    )
    plan.total_amount = sum((item.planned_amount for item in schedules), Decimal("0.00"))
    plan.total_months = len(schedules)


def _renumber_schedules(schedules: list[PaymentSchedule]) -> None:
    for index, item in enumerate(sorted(schedules, key=lambda row: row.month_number), start=1):
        item.month_number = index


def waive_schedule_overdue(
    schedule: PaymentSchedule,
    *,
    comment: str | None = None,
) -> PaymentSchedule:
    if schedule.status == PaymentScheduleStatus.PAID:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Нельзя снять просрочку с полностью оплаченного месяца",
        )

    schedule.overdue_waived = True
    if comment:
        schedule.deferral_comment = comment.strip()
    _refresh_schedule_status(schedule)
    return schedule


def update_schedule_item(
    db: Session,
    schedule: PaymentSchedule,
    *,
    planned_amount: Decimal | None = None,
    due_date: date | None = None,
) -> PaymentSchedule:
    if planned_amount is not None:
        if planned_amount <= Decimal("0.00"):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Сумма платежа должна быть больше нуля",
            )
        if planned_amount < schedule.paid_amount:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Сумма месяца не может быть меньше уже оплаченного",
            )
        schedule.planned_amount = planned_amount

    if due_date is not None:
        schedule.due_date = due_date

    _refresh_schedule_status(schedule)
    _sync_plan_totals(db, schedule.installment_plan)
    return schedule


def add_schedule_month(
    db: Session,
    plan: InstallmentPlan,
    *,
    planned_amount: Decimal,
    due_date: date | None = None,
) -> PaymentSchedule:
    if planned_amount <= Decimal("0.00"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Сумма платежа должна быть больше нуля",
        )

    schedules = list(
        db.scalars(
            select(PaymentSchedule)
            .where(PaymentSchedule.installment_plan_id == plan.id)
            .order_by(PaymentSchedule.month_number)
        )
    )

    if due_date is None:
        if schedules:
            due_date = schedules[-1].due_date + relativedelta(months=1)
        else:
            due_date = plan.start_date

    month_number = (schedules[-1].month_number + 1) if schedules else 1
    item = PaymentSchedule(
        installment_plan_id=plan.id,
        month_number=month_number,
        due_date=due_date,
        planned_amount=planned_amount,
        paid_amount=Decimal("0.00"),
        status=PaymentScheduleStatus.PENDING,
    )
    db.add(item)
    db.flush()
    _sync_plan_totals(db, plan)
    return item


def delete_schedule_item(db: Session, schedule: PaymentSchedule) -> None:
    if schedule.paid_amount > Decimal("0.00"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Нельзя удалить месяц с уже внесёнными платежами",
        )

    plan = schedule.installment_plan
    plan_id = plan.id
    db.delete(schedule)
    db.flush()

    remaining = list(
        db.scalars(
            select(PaymentSchedule)
            .where(PaymentSchedule.installment_plan_id == plan_id)
            .order_by(PaymentSchedule.month_number)
        )
    )
    _renumber_schedules(remaining)
    plan = db.get(InstallmentPlan, plan_id)
    if plan is not None:
        _sync_plan_totals(db, plan)


def get_plan_schedules(db: Session, plan_id: UUID) -> list[PaymentSchedule]:
    return list(
        db.scalars(
            select(PaymentSchedule)
            .where(PaymentSchedule.installment_plan_id == plan_id)
            .order_by(PaymentSchedule.month_number)
        )
    )
