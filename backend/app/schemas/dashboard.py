from datetime import date
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel


class DashboardSummary(BaseModel):
    clients_total: int
    clients_active: int
    clients_overdue: int
    expected_this_month: Decimal
    collected_this_month: Decimal
    overdue_amount: Decimal
    total_remainder: Decimal
    total_collected: Decimal
    active_debt_total: Decimal
    monthly_expenses: Decimal
    net_profit_this_month: Decimal
