from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import ExpenseCategory, ExpenseGroup


class OperatingExpenseCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    category: ExpenseCategory
    expense_group: ExpenseGroup = ExpenseGroup.PRODUCTION
    amount: Decimal = Field(gt=0, decimal_places=2)
    pay_day: int | None = Field(default=None, ge=1, le=31)
    is_active: bool = True
    sort_order: int = 0


class OperatingExpenseUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    category: ExpenseCategory | None = None
    expense_group: ExpenseGroup | None = None
    amount: Decimal | None = Field(default=None, gt=0, decimal_places=2)
    pay_day: int | None = Field(default=None, ge=1, le=31)
    is_active: bool | None = None
    sort_order: int | None = None


class OperatingExpenseResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    name: str
    category: ExpenseCategory
    expense_group: ExpenseGroup
    amount: Decimal
    pay_day: int | None
    is_active: bool
    sort_order: int
