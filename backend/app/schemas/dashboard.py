from datetime import date
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.enums import ClientStatus


class MandatoryPaymentBreakdown(BaseModel):
    deposit: Decimal
    financial_management: Decimal
    court_fee: Decimal
    total: Decimal


class DocumentCollectionBreakdown(BaseModel):
    collection_cash: Decimal
    notary_fee: Decimal
    manager_commission: Decimal
    paid_count: int


class DashboardOverdueClientItem(BaseModel):
    id: UUID
    full_name: str
    phone: str
    contract_date: date
    status: ClientStatus
    contract_total: Decimal | None = None


class CashBalanceUpdate(BaseModel):
    month: str = Field(pattern=r"^\d{4}-\d{2}$")
    opening_amount: Decimal = Field(decimal_places=2)
    comment: str | None = Field(default=None, max_length=2000)


class CashBalanceCarryForward(BaseModel):
    month: str = Field(pattern=r"^\d{4}-\d{2}$")


class CashBalanceResponse(BaseModel):
    month: str
    opening_amount: Decimal
    comment: str | None = None


class DashboardSummary(BaseModel):
    period_month: str
    is_current_month: bool
    clients_total: int
    clients_active: int
    clients_overdue: int
    clients_new_this_month: int = 0
    collection_in_progress: int = 0
    expected_this_month: Decimal
    collected_this_month: Decimal
    cash_received_this_month: Decimal
    overdue_amount: Decimal
    total_remainder: Decimal
    total_collected: Decimal
    active_contract_total: Decimal
    monthly_expenses: Decimal
    fixed_monthly_expenses: Decimal
    one_time_expenses_this_month: Decimal
    mandatory_paid_total: MandatoryPaymentBreakdown
    mandatory_paid_this_month: MandatoryPaymentBreakdown
    document_collection_total: DocumentCollectionBreakdown
    document_collection_this_month: DocumentCollectionBreakdown
    contracts_signed_this_month: int
    org_profit_total: Decimal
    net_profit_this_month: Decimal
    cash_opening_balance: Decimal = Decimal("0.00")
    cash_opening_is_set: bool = False
    cash_opening_comment: str | None = None
    cash_in_this_month: Decimal = Decimal("0.00")
    expenses_paid_this_month: Decimal = Decimal("0.00")
    expenses_remaining_this_month: Decimal = Decimal("0.00")
    cash_on_hand: Decimal = Decimal("0.00")
    cash_forecast_end: Decimal = Decimal("0.00")
    civil_cases_total: int = 0
    civil_cases_this_month: int = 0
    civil_income_total: Decimal = Decimal("0.00")
    civil_income_this_month: Decimal = Decimal("0.00")
    open_tasks_count: int = 0
    overdue_clients_preview: list[DashboardOverdueClientItem] = []
