from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models.retail_client import RetailClient
from app.models.retail_contract import RetailContract
from app.services.file_storage import delete_storage_key
from app.models.retail_payment import RetailPayment


def hard_delete_retail_contract(db: Session, contract_id: UUID) -> None:
    contract = db.get(RetailContract, contract_id)
    if contract is not None:
        delete_storage_key(contract.signed_contract_pdf_path)
    db.execute(delete(RetailPayment).where(RetailPayment.retail_contract_id == contract_id))
    db.execute(delete(RetailContract).where(RetailContract.id == contract_id))


def hard_delete_retail_client(db: Session, client_id: UUID) -> None:
    client = db.get(RetailClient, client_id)
    if client is not None:
        delete_storage_key(client.passport_pdf_path)
    contract_ids = list(
        db.scalars(select(RetailContract.id).where(RetailContract.retail_client_id == client_id))
    )
    for contract_id in contract_ids:
        hard_delete_retail_contract(db, contract_id)
    db.execute(delete(RetailClient).where(RetailClient.id == client_id))
