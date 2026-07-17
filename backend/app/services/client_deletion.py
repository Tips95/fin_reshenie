from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models.client import Client
from app.models.installment_plan import InstallmentPlan
from app.models.payment import Payment


def hard_delete_client(db: Session, client: Client) -> None:
    """Полностью удаляет клиента и все связанные данные."""
    db.execute(delete(Payment).where(Payment.client_id == client.id))

    plan_ids = list(
        db.scalars(select(InstallmentPlan.id).where(InstallmentPlan.client_id == client.id))
    )
    if plan_ids:
        db.execute(delete(InstallmentPlan).where(InstallmentPlan.client_id == client.id))

    db.delete(client)
    db.flush()
