from datetime import date
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import MandatoryPaymentStatus, MandatoryPaymentType


class MandatoryPaymentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    client_id: UUID
    payment_type: MandatoryPaymentType
    planned_amount: Decimal
    paid_amount: Decimal
    paid_date: date | None
    status: MandatoryPaymentStatus
    is_applicable: bool
    comment: str | None


class MandatoryPaymentUpdate(BaseModel):
    planned_amount: Decimal | None = Field(default=None, ge=0, decimal_places=2)
    is_applicable: bool | None = None
    comment: str | None = None


class MandatoryPaymentRecord(BaseModel):
    amount: Decimal = Field(gt=0, decimal_places=2)
    payment_date: date
    comment: str | None = None
