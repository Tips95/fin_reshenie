from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.services.default_pricing_tiers import MIN_DEBT_AMOUNT


class InstallmentPlanCreate(BaseModel):
    pricing_tier_id: UUID | None = None
    start_date: date | None = None
    total_amount: Decimal | None = Field(default=None, gt=0, decimal_places=2)


class InstallmentPlanFromTier(BaseModel):
    debt_amount: Decimal = Field(ge=MIN_DEBT_AMOUNT, decimal_places=2)
    contract_date: date | None = None


class InstallmentPlanUpdate(BaseModel):
    total_amount: Decimal = Field(gt=0, decimal_places=2)


class InstallmentPlanResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    client_id: UUID
    pricing_tier_id: UUID | None
    total_amount: Decimal
    start_date: date
    total_months: int
    created_at: datetime
