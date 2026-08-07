from datetime import date
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.enums import (
    PaymentScheduleStatus,
    RetailContractStatus,
    RetailOverdueStatus,
    RetailPaymentType,
)
from app.services.validation import (
    validate_address,
    validate_full_name,
    validate_passport,
    validate_phone_optional,
    validate_phone_required,
)


class RetailClientCreate(BaseModel):
    full_name: str = Field(min_length=1, max_length=255)
    phone: str = Field(min_length=1, max_length=32)
    passport: str | None = Field(default=None, max_length=64)
    address: str | None = None
    guarantor_full_name: str | None = Field(default=None, max_length=255)
    guarantor_phone: str | None = Field(default=None, max_length=32)
    guarantor_passport: str | None = Field(default=None, max_length=64)

    @field_validator("full_name", "guarantor_full_name")
    @classmethod
    def check_full_name(cls, value: str | None) -> str | None:
        if value is None or not value.strip():
            return None
        return validate_full_name(value)

    @field_validator("phone", "guarantor_phone")
    @classmethod
    def check_phone(cls, value: str | None) -> str | None:
        if value is None or not value.strip():
            return None
        return validate_phone_required(value)

    @field_validator("passport", "guarantor_passport")
    @classmethod
    def check_passport(cls, value: str | None) -> str | None:
        if value is None or not value.strip():
            return None
        return validate_passport(value)

    @field_validator("address")
    @classmethod
    def check_address(cls, value: str | None) -> str | None:
        if value is None or not value.strip():
            return None
        return validate_address(value)


class RetailClientUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=1, max_length=255)
    phone: str | None = Field(default=None, min_length=1, max_length=32)
    passport: str | None = Field(default=None, min_length=1, max_length=64)
    address: str | None = None
    guarantor_full_name: str | None = Field(default=None, min_length=1, max_length=255)
    guarantor_phone: str | None = Field(default=None, min_length=1, max_length=32)
    guarantor_passport: str | None = Field(default=None, min_length=1, max_length=64)

    @field_validator("full_name", "guarantor_full_name")
    @classmethod
    def check_full_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return validate_full_name(value)

    @field_validator("phone", "guarantor_phone")
    @classmethod
    def check_phone(cls, value: str | None) -> str | None:
        return validate_phone_optional(value)

    @field_validator("passport", "guarantor_passport")
    @classmethod
    def check_passport(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return validate_passport(value)

    @field_validator("address")
    @classmethod
    def check_address(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return validate_address(value)


class RetailClientResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    full_name: str
    phone: str
    passport: str | None = None
    address: str | None = None
    guarantor_full_name: str | None = None
    guarantor_phone: str | None = None
    guarantor_passport: str | None = None
    contracts_count: int = 0
    purchase_total: Decimal = Decimal("0.00")
    revenue_total: Decimal = Decimal("0.00")
    collected_total: Decimal = Decimal("0.00")
    expected_profit: Decimal = Decimal("0.00")
    collected_profit: Decimal = Decimal("0.00")
    remainder_total: Decimal = Decimal("0.00")
    has_passport_pdf: bool = False
    passport_pdf_filename: str | None = None
    has_guarantor_passport_pdf: bool = False
    guarantor_passport_pdf_filename: str | None = None


class RetailTermRateResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    term_months: int
    markup_percent: Decimal


class RetailContractCreate(BaseModel):
    retail_client_id: UUID
    investor_id: UUID | None = None
    product_name: str = Field(min_length=1, max_length=255)
    purchase_price: Decimal = Field(gt=0)
    product_price: Decimal = Field(gt=0)
    term_months: int = Field(ge=6, le=12)
    down_payment: Decimal = Field(ge=0)
    contract_date: date


class RetailDealCreate(BaseModel):
    full_name: str = Field(min_length=1, max_length=255)
    phone: str = Field(min_length=1, max_length=32)
    product_name: str = Field(min_length=1, max_length=255)
    purchase_price: Decimal = Field(gt=0)
    product_price: Decimal = Field(gt=0)
    term_months: int = Field(ge=6, le=12)
    down_payment: Decimal = Field(ge=0, default=Decimal("0.00"))
    contract_date: date
    investor_id: UUID | None = None
    passport: str | None = Field(default=None, max_length=64)
    address: str | None = None

    @field_validator("full_name")
    @classmethod
    def check_full_name(cls, value: str) -> str:
        return validate_full_name(value)

    @field_validator("phone")
    @classmethod
    def check_phone(cls, value: str) -> str:
        return validate_phone_required(value)

    @field_validator("passport")
    @classmethod
    def check_passport(cls, value: str | None) -> str | None:
        if value is None or not value.strip():
            return None
        return validate_passport(value)

    @field_validator("address")
    @classmethod
    def check_address(cls, value: str | None) -> str | None:
        if value is None or not value.strip():
            return None
        return validate_address(value)


class RetailDealResponse(BaseModel):
    client: RetailClientResponse
    contract: "RetailContractDetail"


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
    purchase_price: Decimal
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
    expected_profit: Decimal = Decimal("0.00")
    collected_profit: Decimal = Decimal("0.00")
    markup_amount: Decimal = Decimal("0.00")
    has_overdue: bool = False
    has_signed_contract_pdf: bool = False
    signed_contract_pdf_filename: str | None = None


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

    @field_validator("amount", mode="before")
    @classmethod
    def normalize_amount(cls, value: object) -> object:
        if isinstance(value, str):
            cleaned = value.strip().replace(" ", "").replace(",", ".")
            if not cleaned:
                raise ValueError("Укажите сумму")
            return cleaned
        return value

    @field_validator("comment")
    @classmethod
    def normalize_comment(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        return stripped or None


class InvestorSummaryItem(BaseModel):
    investor_id: UUID
    investor_name: str
    investment_amount: Decimal = Decimal("0.00")
    contracts_count: int
    purchase_total: Decimal = Decimal("0.00")
    total_amount: Decimal
    collected_total: Decimal
    remainder_total: Decimal
    expected_profit: Decimal = Decimal("0.00")
    collected_profit: Decimal = Decimal("0.00")
    overdue_count: int


class RetailDashboardSummary(BaseModel):
    contracts_count: int
    active_count: int
    overdue_count: int
    purchase_total: Decimal = Decimal("0.00")
    total_amount: Decimal
    collected_total: Decimal
    remainder_total: Decimal
    expected_profit: Decimal = Decimal("0.00")
    collected_profit: Decimal = Decimal("0.00")
    down_payment_total: Decimal
    investors: list[InvestorSummaryItem] = []


RetailDealResponse.model_rebuild()
