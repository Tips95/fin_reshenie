from datetime import date
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel


class MandatoryOutflowItem(BaseModel):
    client_id: UUID
    client_name: str
    payment_type: Literal["deposit", "financial_management"]
    amount: Decimal
    payment_date: date


class MandatoryOutflowMonth(BaseModel):
    month: str
    deposit: Decimal
    financial_management: Decimal
    total: Decimal


class MandatoryOutflowsOverview(BaseModel):
    month: str
    deposit: Decimal
    financial_management: Decimal
    total: Decimal
    items: list[MandatoryOutflowItem]
    history: list[MandatoryOutflowMonth]
