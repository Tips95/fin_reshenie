import re
from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

_MONTH_RE = re.compile(r"^\d{4}-\d{2}$")


class PaymentReminderItem(BaseModel):
    client_id: UUID
    full_name: str
    phone: str
    kind: str
    amount: Decimal
    due_date: date
    message: str
    has_phone: bool
    last_sent_at: datetime | None = None


class PaymentRemindersPreview(BaseModel):
    period_month: str
    green_api_configured: bool
    total: int
    due_count: int
    overdue_count: int
    without_phone_count: int
    already_sent_this_month: int
    due_template: str
    overdue_template: str
    items: list[PaymentReminderItem]


class PaymentRemindersSendRequest(BaseModel):
    month: str | None = None
    client_ids: list[UUID] | None = Field(default=None)
    # Готовые тексты по client_id (после правок в UI).
    messages: dict[UUID, str] | None = Field(default=None)

    @field_validator("month")
    @classmethod
    def validate_month(cls, value: str | None) -> str | None:
        if value is None:
            return None
        if not _MONTH_RE.fullmatch(value):
            raise ValueError("month должен быть в формате YYYY-MM")
        return value


class PaymentReminderSendItemResult(BaseModel):
    client_id: UUID
    full_name: str
    kind: str
    status: str
    error: str | None = None
    id_message: str | None = None


class PaymentRemindersSendResponse(BaseModel):
    period_month: str
    batch_id: UUID
    sent: int
    failed: int
    skipped: int
    items: list[PaymentReminderSendItemResult]
