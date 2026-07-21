from datetime import date
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel


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
    mandatory_paid_total: MandatoryPaymentBreakdown
    mandatory_paid_this_month: MandatoryPaymentBreakdown
    document_collection_total: DocumentCollectionBreakdown
    document_collection_this_month: DocumentCollectionBreakdown
    contracts_signed_this_month: int
    org_profit_total: Decimal
    net_profit_this_month: Decimal
