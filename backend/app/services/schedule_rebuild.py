from datetime import date

from dateutil.relativedelta import relativedelta
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.client import Client
from app.models.installment_plan import InstallmentPlan
from app.models.payment_schedule import PaymentSchedule


def rebuild_schedule_dates_from_contract(db: Session, client: Client) -> int:
    plan = db.scalar(
        select(InstallmentPlan)
        .where(InstallmentPlan.client_id == client.id)
        .order_by(InstallmentPlan.created_at.desc())
    )
    if plan is None:
        return 0

    plan.start_date = client.contract_date
    schedules = list(
        db.scalars(
            select(PaymentSchedule)
            .where(PaymentSchedule.installment_plan_id == plan.id)
            .order_by(PaymentSchedule.month_number)
        )
    )

    updated = 0
    for schedule in schedules:
        new_due = client.contract_date + relativedelta(months=schedule.month_number - 1)
        if schedule.due_date != new_due:
            schedule.due_date = new_due
            updated += 1

    return updated
