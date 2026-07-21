from datetime import date
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel

from app.models.enums import ClientStatus
from app.schemas.dashboard import MandatoryPaymentBreakdown


class ClientProfitItem(BaseModel):
    client_id: UUID
    full_name: str
    contract_date: date
    status: ClientStatus
    debt_amount: Decimal
    installment_total: Decimal | None
    collected_total: Decimal
    mandatory_paid_total: Decimal
    profit: Decimal
    schedule_remainder: Decimal
    mandatory_remainder: Decimal
    has_overdue: bool


class MonthlyTrendPoint(BaseModel):
    month: str
    collected: Decimal
    expected: Decimal
    expenses: Decimal
    mandatory_paid: Decimal
    net_profit: Decimal
    payments_count: int


class AnalyticsSummary(BaseModel):
    clients_count: int
    collected_total: Decimal
    profit_total: Decimal
    schedule_remainder_total: Decimal
    monthly_expenses: Decimal
    mandatory_paid_total: MandatoryPaymentBreakdown


class AnalyticsOverview(BaseModel):
    summary: AnalyticsSummary
    trends: list[MonthlyTrendPoint]
    client_profits: list[ClientProfitItem]
