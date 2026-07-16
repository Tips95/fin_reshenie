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


class PaymentScheduleDefer(BaseModel):
    deferred_until: date
    comment: str = Field(min_length=1, max_length=2000)
