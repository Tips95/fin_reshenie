from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class InstallmentPlanCreate(BaseModel):
    pricing_tier_id: UUID | None = None
    start_date: date | None = None
    total_amount: Decimal | None = Field(default=None, gt=0, decimal_places=2)


class InstallmentPlanResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    client_id: UUID
    pricing_tier_id: UUID | None
    total_amount: Decimal
    start_date: date
    total_months: int
    created_at: datetime
