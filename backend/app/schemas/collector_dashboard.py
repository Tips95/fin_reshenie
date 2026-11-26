from datetime import date
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel

from app.models.enums import CollectionCallResult


class CollectorDueMonthItem(BaseModel):
    client_id: UUID
    full_name: str
    phone: str
    due_date: date
    month_number: int
    remainder: Decimal
    payment_schedule_id: UUID


class CollectorOverduePreviewItem(BaseModel):
    client_id: UUID
    full_name: str
    phone: str
    overdue_amount: Decimal
    overdue_days: int
    promised_pay_date: date | None = None
    last_call_result: CollectionCallResult | None = None


class CollectorPromisedTodayItem(BaseModel):
    client_id: UUID
    full_name: str
    phone: str
    overdue_amount: Decimal
    promised_pay_date: date
    payment_schedule_id: UUID
    manager_note: str | None = None


class CollectorDashboard(BaseModel):
    period_month: str
    is_current_month: bool
    expected_this_month: Decimal
    collectable_by_month_end: Decimal = Decimal("0.00")
    collected_this_month: Decimal
    overdue_amount: Decimal
    clients_overdue: int
    promised_today_count: int
    no_contact_count: int
    due_this_month_preview: list[CollectorDueMonthItem] = []
    overdue_preview: list[CollectorOverduePreviewItem] = []
    promised_today_preview: list[CollectorPromisedTodayItem] = []
