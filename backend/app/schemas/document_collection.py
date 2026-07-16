from datetime import date
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import DocumentCollectionStatus
from app.services.default_pricing_tiers import MIN_DEBT_AMOUNT


class DocumentCollectionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    client_id: UUID
    total_amount: Decimal
    collection_fee: Decimal
    notary_fee: Decimal
    manager_commission: Decimal
    status: DocumentCollectionStatus
    paid_date: date | None


class RecordDocumentCollectionPayment(BaseModel):
    payment_date: date


class ConvertToBankruptcyRequest(BaseModel):
    debt_amount: Decimal = Field(ge=MIN_DEBT_AMOUNT, decimal_places=2)
    contract_date: date | None = None


class ManagerCommissionItem(BaseModel):
    manager_id: UUID | None
    manager_name: str
    client_id: UUID
    client_name: str
    commission_amount: Decimal
    paid_date: date
    document_collection_id: UUID


class ManagerCommissionsOverview(BaseModel):
    total_commission: Decimal
    paid_count: int
    items: list[ManagerCommissionItem]
