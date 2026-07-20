from datetime import date
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import PaymentScheduleStatus


class PaymentScheduleResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    installment_plan_id: UUID
    month_number: int
    due_date: date
    planned_amount: Decimal
    paid_amount: Decimal
    paid_date: date | None
    status: PaymentScheduleStatus
    deferred_until: date | None = None
    deferral_comment: str | None = None
    overdue_waived: bool = False


class PaymentScheduleDefer(BaseModel):
    deferred_until: date
    comment: str = Field(min_length=1, max_length=2000)


class PaymentScheduleWaiveOverdue(BaseModel):
    comment: str | None = Field(default=None, max_length=2000)


class PaymentScheduleUpdate(BaseModel):
    planned_amount: Decimal | None = Field(default=None, gt=0, decimal_places=2)
    due_date: date | None = None


class PaymentScheduleCreate(BaseModel):
    planned_amount: Decimal = Field(gt=0, decimal_places=2)
    due_date: date | None = None
