from datetime import date
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


ShareRole = Literal["manager", "executor", "both"]


class CivilShareLine(BaseModel):
    case_id: UUID
    client_name: str
    appeal_date: date
    price: Decimal
    role: ShareRole
    share_label: str
    amount: Decimal
    collected: bool


class CivilSharePayeeRow(BaseModel):
    payee_id: UUID
    payee_name: str
    lines_count: int
    total_amount: Decimal
    to_pay_amount: Decimal
    paid_amount: Decimal
    lines: list[CivilShareLine]


class CivilSharesOverview(BaseModel):
    month: str
    cases_count: int
    total_amount: Decimal
    to_pay_amount: Decimal
    paid_amount: Decimal
    outstanding_to_pay_amount: Decimal
    payees: list[CivilSharePayeeRow]


class CivilShareMark(BaseModel):
    case_id: UUID
    role: ShareRole


class CivilShareBulkUpdate(BaseModel):
    marks: list[CivilShareMark] = Field(min_length=1, max_length=200)
    collected: bool


class CivilShareBulkResult(BaseModel):
    updated_count: int
