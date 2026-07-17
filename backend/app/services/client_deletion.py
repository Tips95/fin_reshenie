from sqlalchemy import delete
from sqlalchemy.orm import Session

from app.models.client import Client
from app.models.client_mandatory_payment import ClientMandatoryPayment
from app.models.court_deposit_tracking import CourtDepositTracking
from app.models.document_collection import DocumentCollection
from app.models.installment_plan import InstallmentPlan
from app.models.manager_task import ManagerTask
from app.models.payment import Payment


def hard_delete_client(db: Session, client: Client) -> None:
    """Полностью удаляет клиента и все связанные данные."""
    client_id = client.id

    db.execute(delete(Payment).where(Payment.client_id == client_id))
    db.execute(delete(InstallmentPlan).where(InstallmentPlan.client_id == client_id))
    db.execute(delete(ClientMandatoryPayment).where(ClientMandatoryPayment.client_id == client_id))
    db.execute(delete(DocumentCollection).where(DocumentCollection.client_id == client_id))
    db.execute(delete(ManagerTask).where(ManagerTask.client_id == client_id))
    db.execute(delete(CourtDepositTracking).where(CourtDepositTracking.client_id == client_id))
    db.execute(delete(Client).where(Client.id == client_id))
    db.flush()
