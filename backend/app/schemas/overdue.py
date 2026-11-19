from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import CollectionCallResult, ClientStatus


class CollectionEventResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    client_id: UUID
    payment_schedule_id: UUID
    author_id: UUID | None = None
    author_name: str | None = None
    result: CollectionCallResult | None = None
    promised_pay_date: date | None = None
    body: str | None = None
    created_at: datetime


class CollectionUpdate(BaseModel):
    """Заметка и/или результат звонка и/или дата обещанной оплаты."""

    manager_note: str | None = Field(default=None, max_length=4000)
    clear_manager_note: bool = False
    call_result: CollectionCallResult | None = None
    promised_pay_date: date | None = None
    clear_promised_pay_date: bool = False


class OverdueQueueItem(BaseModel):
    client_id: UUID
    full_name: str
    phone: str
    status: ClientStatus
    overdue_amount: Decimal
    overdue_days: int
    oldest_due_date: date
    payment_schedule_id: UUID
    month_number: int
    manager_note: str | None = None
    last_call_result: CollectionCallResult | None = None
    last_call_at: datetime | None = None
    promised_pay_date: date | None = None


class OverdueQueueResponse(BaseModel):
    items: list[OverdueQueueItem]
    total: int
