from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class PaymentCreate(BaseModel):
    client_id: UUID
    payment_schedule_id: UUID | None = None
    amount: Decimal = Field(gt=0, decimal_places=2)
    payment_date: date
    comment: str | None = None
    is_refund: bool = False


class PaymentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    client_id: UUID
    payment_schedule_id: UUID | None
    amount: Decimal
    payment_date: date
    comment: str | None
    created_by: UUID
    is_deleted: bool
    is_refund: bool
    created_at: datetime
