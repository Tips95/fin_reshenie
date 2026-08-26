from datetime import date
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

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


class DocumentCollectionUpdate(BaseModel):
    collection_fee: Decimal = Field(ge=Decimal("0.00"), decimal_places=2)
    notary_fee: Decimal = Field(ge=Decimal("0.00"), decimal_places=2)
    manager_commission: Decimal = Field(ge=Decimal("0.00"), decimal_places=2)
    paid_date: date | None = None


class RecordDocumentCollectionPayment(BaseModel):
    payment_date: date


class ConvertToBankruptcyRequest(BaseModel):
    auto_installment: bool = False
    debt_amount: Decimal | None = Field(default=None, decimal_places=2)
    contract_total: Decimal | None = Field(default=None, gt=0, decimal_places=2)
    contract_date: date | None = None

    @model_validator(mode="after")
    def validate_installment_mode(self) -> "ConvertToBankruptcyRequest":
        if self.auto_installment:
            if self.debt_amount is None or self.debt_amount < MIN_DEBT_AMOUNT:
                raise ValueError(
                    f"Для автоматической рассрочки укажите сумму долга от {MIN_DEBT_AMOUNT} ₽"
                )
        return self


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
