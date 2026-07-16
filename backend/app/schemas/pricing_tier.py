from datetime import date
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.services.default_pricing_tiers import MIN_DEBT_AMOUNT


class PricingTierCreate(BaseModel):
    min_amount: Decimal = Field(ge=MIN_DEBT_AMOUNT, decimal_places=2)
    max_amount: Decimal = Field(gt=0, decimal_places=2)
    total_cost: Decimal = Field(gt=0, decimal_places=2)
    first_month_payment: Decimal = Field(ge=0, decimal_places=2)
    second_month_payment: Decimal = Field(ge=0, decimal_places=2)
    remaining_months_count: int = Field(ge=0)
    remaining_month_payment: Decimal = Field(ge=0, decimal_places=2)
    total_months: int = Field(ge=1)
    is_active: bool = True
    effective_from: date

    @model_validator(mode="after")
    def validate_amounts(self) -> "PricingTierCreate":
        if self.min_amount < MIN_DEBT_AMOUNT:
            raise ValueError("Банкротство оформляется при долге от 300 000 ₽")
        if self.min_amount >= self.max_amount:
            raise ValueError("min_amount должен быть меньше max_amount")
        expected_months = 2 + self.remaining_months_count
        if self.total_months != expected_months:
            raise ValueError("total_months должен равняться 2 + remaining_months_count")
        total = (
            self.first_month_payment
            + self.second_month_payment
            + self.remaining_month_payment * self.remaining_months_count
        )
        if total != self.total_cost:
            raise ValueError("Сумма платежей должна равняться total_cost")
        return self


class PricingTierUpdate(BaseModel):
    min_amount: Decimal | None = Field(default=None, ge=MIN_DEBT_AMOUNT, decimal_places=2)
    max_amount: Decimal | None = Field(default=None, gt=0, decimal_places=2)
    total_cost: Decimal | None = Field(default=None, gt=0, decimal_places=2)
    first_month_payment: Decimal | None = Field(default=None, ge=0, decimal_places=2)
    second_month_payment: Decimal | None = Field(default=None, ge=0, decimal_places=2)
    remaining_months_count: int | None = Field(default=None, ge=0)
    remaining_month_payment: Decimal | None = Field(default=None, ge=0, decimal_places=2)
    total_months: int | None = Field(default=None, ge=1)
    is_active: bool | None = None
    effective_from: date | None = None


class PricingTierResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    min_amount: Decimal
    max_amount: Decimal
    total_cost: Decimal
    first_month_payment: Decimal
    second_month_payment: Decimal
    remaining_months_count: int
    remaining_month_payment: Decimal
    total_months: int
    is_active: bool
    effective_from: date
