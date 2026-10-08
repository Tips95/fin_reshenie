from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel


class ManagerFirstCommissionClientItem(BaseModel):
    client_id: UUID
    client_name: str
    contract_date: date
    manager_id: UUID | None
    manager_name: str
    amount: Decimal
    collected: bool
    collected_at: datetime | None = None


class ManagerFirstCommissionManagerRow(BaseModel):
    manager_id: UUID | None
    manager_name: str
    clients_count: int
    total_amount: Decimal
    to_pay_amount: Decimal
    paid_amount: Decimal
    clients: list[ManagerFirstCommissionClientItem]


class ManagerFirstCommissionsOverview(BaseModel):
    month: str
    commission_per_client: Decimal
    clients_count: int
    total_amount: Decimal
    to_pay_amount: Decimal
    paid_amount: Decimal
    outstanding_to_pay_amount: Decimal
    managers: list[ManagerFirstCommissionManagerRow]
