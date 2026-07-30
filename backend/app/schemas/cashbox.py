from datetime import date
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel

from app.models.enums import MandatoryPaymentType, PaymentScheduleStatus


class CashboxScheduleItem(BaseModel):
    schedule_id: UUID
    client_id: UUID
    client_name: str
    phone: str
    month_number: int
    due_date: date
    planned_amount: Decimal
    paid_amount: Decimal
    remainder: Decimal
    status: PaymentScheduleStatus
    is_overdue: bool
    overdue_days: int
    is_deferred: bool
    manager_name: str | None = None


class CashboxCollectionItem(BaseModel):
    client_id: UUID
    client_name: str
    phone: str
    contract_date: date
    total_amount: Decimal
    collection_fee: Decimal
    notary_fee: Decimal
    manager_commission: Decimal
    waiting_days: int
    manager_name: str | None = None


class CashboxMandatoryItem(BaseModel):
    mandatory_payment_id: UUID
    client_id: UUID
    client_name: str
    phone: str
    payment_type: MandatoryPaymentType
    planned_amount: Decimal
    paid_amount: Decimal
    remainder: Decimal


class CashboxGroupTotals(BaseModel):
    count: int
    amount: Decimal


class CashboxOverview(BaseModel):
    month: str
    collected_in_month: Decimal
    expected_total: Decimal
    schedule_totals: CashboxGroupTotals
    collection_totals: CashboxGroupTotals
    mandatory_totals: CashboxGroupTotals
    overdue_count: int
    schedule_items: list[CashboxScheduleItem]
    collection_items: list[CashboxCollectionItem]
    mandatory_items: list[CashboxMandatoryItem]
