from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class OneTimeExpenseCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    amount: Decimal = Field(gt=0, decimal_places=2)
    period_month: date
    expense_date: date | None = None
    comment: str | None = None


class OneTimeExpenseUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    amount: Decimal | None = Field(default=None, gt=0, decimal_places=2)
    period_month: date | None = None
    expense_date: date | None = None
    comment: str | None = None


class OneTimeExpenseResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    amount: Decimal
    period_month: date
    expense_date: date
    comment: str | None
    created_by: UUID
    created_at: datetime


class OneTimeExpenseListResponse(OneTimeExpenseResponse):
    created_by_name: str
