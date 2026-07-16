from datetime import date
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import (
    PaymentScheduleStatus,
    RetailContractStatus,
    RetailOverdueStatus,
    RetailPaymentType,
)


class RetailClientCreate(BaseModel):
    full_name: str = Field(min_length=1, max_length=255)
    phone: str = Field(min_length=1, max_length=32)
    passport: str = Field(min_length=1, max_length=64)
    address: str = Field(min_length=1)
    guarantor_full_name: str = Field(min_length=1, max_length=255)
    guarantor_phone: str = Field(min_length=1, max_length=32)
    guarantor_passport: str = Field(min_length=1, max_length=64)


class RetailClientUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=1, max_length=255)
    phone: str | None = Field(default=None, min_length=1, max_length=32)
    passport: str | None = Field(default=None, min_length=1, max_length=64)
    address: str | None = None
    guarantor_full_name: str | None = Field(default=None, min_length=1, max_length=255)
    guarantor_phone: str | None = Field(default=None, min_length=1, max_length=32)
    guarantor_passport: str | None = Field(default=None, min_length=1, max_length=64)


class RetailClientResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    full_name: str
    phone: str
    passport: str
    address: str
    guarantor_full_name: str
    guarantor_phone: str
    guarantor_passport: str
    contracts_count: int = 0


class RetailTermRateResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    term_months: int
    markup_percent: Decimal


class RetailContractCreate(BaseModel):
    retail_client_id: UUID
    investor_id: UUID
    product_name: str = Field(min_length=1, max_length=255)
    product_price: Decimal = Field(gt=0)
    term_months: int = Field(ge=6, le=12)
    down_payment: Decimal = Field(ge=0)
    contract_date: date


class RetailPaymentScheduleResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    month_number: int
    due_date: date
    planned_amount: Decimal
    paid_amount: Decimal
    paid_date: date | None
    status: PaymentScheduleStatus


class RetailPaymentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    payment_type: RetailPaymentType
    amount: Decimal
    payment_date: date
    comment: str | None
    payment_schedule_id: UUID | None
    created_by_id: UUID


class RetailOverdueLogCreate(BaseModel):
    action_date: date
    comment: str = Field(min_length=1)
    promised_date: date | None = None
    status: RetailOverdueStatus = RetailOverdueStatus.IN_PROGRESS


class RetailOverdueLogResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    action_date: date
    comment: str
    promised_date: date | None
    status: RetailOverdueStatus
    created_by_id: UUID


class RetailContractBrief(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    retail_client_id: UUID
    investor_id: UUID
    investor_name: str
    client_name: str
    product_name: str
    product_price: Decimal
    term_months: int
    markup_percent: Decimal
    total_amount: Decimal
    down_payment: Decimal
    financed_amount: Decimal
    monthly_payment: Decimal
    contract_date: date
    status: RetailContractStatus
    collected_total: Decimal = Decimal("0.00")
    remainder_total: Decimal = Decimal("0.00")
    has_overdue: bool = False


class RetailContractDetail(RetailContractBrief):
    payment_schedule: list[RetailPaymentScheduleResponse]
    payments: list[RetailPaymentResponse]
    overdue_logs: list[RetailOverdueLogResponse]


class RetailPaymentCreate(BaseModel):
    amount: Decimal = Field(gt=0)
    payment_date: date
    payment_type: RetailPaymentType
    payment_schedule_id: UUID | None = None
    comment: str | None = None


class InvestorSummaryItem(BaseModel):
    investor_id: UUID
    investor_name: str
    contracts_count: int
    total_amount: Decimal
    collected_total: Decimal
    remainder_total: Decimal
    overdue_count: int


class RetailDashboardSummary(BaseModel):
    contracts_count: int
    active_count: int
    overdue_count: int
    total_amount: Decimal
    collected_total: Decimal
    remainder_total: Decimal
    down_payment_total: Decimal
    investors: list[InvestorSummaryItem] = []
