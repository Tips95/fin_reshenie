from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import ExpenseGroup


class ExpensePaymentCreate(BaseModel):
    amount: Decimal = Field(gt=0, decimal_places=2)
    payment_date: date
    period_month: date
    comment: str | None = None


class ExpensePaymentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    expense_id: UUID
    amount: Decimal
    payment_date: date
    period_month: date
    comment: str | None
    created_by: UUID
    created_at: datetime
