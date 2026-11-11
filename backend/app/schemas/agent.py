import re
from datetime import date, datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.models.enums import LeadStatus
from app.services.validation import validate_full_name, validate_phone_required

INN_MESSAGE = "ИНН — 10 или 12 цифр"
TERMS_MESSAGE = "Нужно принять пользовательское соглашение"


def normalize_telegram(value: str | None) -> str | None:
    text = (value or "").strip()
    if not text:
        return None
    if text.startswith("https://t.me/"):
        text = text.removeprefix("https://t.me/")
    if not text.startswith("@"):
        text = f"@{text}"
    if not re.fullmatch(r"@[A-Za-z0-9_]{4,32}", text):
        raise ValueError("Telegram: укажите ник, например @ivanov")
    return text


def normalize_inn(value: str | None) -> str | None:
    digits = re.sub(r"\D", "", value or "")
    if not digits:
        return None
    if len(digits) not in (10, 12):
        raise ValueError(INN_MESSAGE)
    return digits


class AgentSignupInfo(BaseModel):
    """Публично: показывать ли на сайте кнопку регистрации удалённого менеджера."""

    open: bool
    organization_name: str | None = None


class AgentSignupSettings(BaseModel):
    open: bool


class AgentRegisterRequest(BaseModel):
    """Самостоятельная регистрация удалённого менеджера. Вход — по телефону или email."""

    full_name: str = Field(min_length=3, max_length=255)
    phone: str = Field(max_length=32)
    email: EmailStr | None = None
    telegram: str | None = Field(default=None, max_length=64)
    inn: str | None = Field(default=None, max_length=16)
    password: str = Field(min_length=6, max_length=128)
    accept_terms: bool
    terms_version: str = Field(max_length=20)

    @field_validator("full_name")
    @classmethod
    def check_full_name(cls, value: str) -> str:
        return validate_full_name(value)

    @field_validator("phone")
    @classmethod
    def check_phone(cls, value: str) -> str:
        return validate_phone_required(value)

    @field_validator("telegram")
    @classmethod
    def check_telegram(cls, value: str | None) -> str | None:
        return normalize_telegram(value)

    @field_validator("inn")
    @classmethod
    def check_inn(cls, value: str | None) -> str | None:
        return normalize_inn(value)

    @field_validator("accept_terms")
    @classmethod
    def check_terms(cls, value: bool) -> bool:
        if not value:
            raise ValueError(TERMS_MESSAGE)
        return value


class AgentCuratorUpdate(BaseModel):
    curator_id: UUID | None = None


class AgentActiveUpdate(BaseModel):
    is_active: bool


class AgentNoteUpdate(BaseModel):
    note: str | None = Field(default=None, max_length=4000)


class AgentCuratorOption(BaseModel):
    id: UUID
    full_name: str
    role: str


class AgentResponse(BaseModel):
    id: UUID
    full_name: str
    phone: str | None
    email: str | None
    telegram: str | None
    inn: str | None
    is_active: bool
    curator_id: UUID | None
    curator_name: str | None
    created_at: datetime
    terms_accepted_at: datetime | None
    terms_version: str | None
    agent_note: str | None = None
    leads_total: int = 0
    contracts_total: int = 0
    earned_total: Decimal = Decimal("0.00")
    paid_total: Decimal = Decimal("0.00")


class AgentCuratorContact(BaseModel):
    full_name: str
    phone: str | None
    email: str | None
    telegram: str | None


AgentLeadStage = Literal[
    "new",
    "appointment",
    "unqualified",
    "visited",
    "contract",
    "earned",
    "paid_out",
    "cancelled",
]


class AgentLeadRow(BaseModel):
    questionnaire_id: UUID
    full_name: str
    phone: str
    created_at: datetime
    lead_status: LeadStatus
    stage: AgentLeadStage
    appointment_at: date | None = None
    first_payment_date: date | None = None
    commission_amount: Decimal | None = None
    commission_paid_at: datetime | None = None


class AgentOverview(BaseModel):
    curator: AgentCuratorContact | None
    commission_per_client: Decimal
    leads_total: int
    appointments_total: int
    contracts_total: int
    earned_total: Decimal
    paid_total: Decimal
    to_pay_total: Decimal
    leads: list[AgentLeadRow]


class AgentDetail(BaseModel):
    """Карточка удалённого менеджера в разделе офиса."""

    agent: AgentResponse
    overview: AgentOverview


class AgentCommissionClientItem(BaseModel):
    client_id: UUID
    client_name: str
    contract_date: date
    first_payment_date: date
    agent_id: UUID
    agent_name: str
    amount: Decimal
    collected: bool
    collected_at: datetime | None = None


class AgentCommissionAgentRow(BaseModel):
    agent_id: UUID
    agent_name: str
    inn: str | None
    clients_count: int
    total_amount: Decimal
    to_pay_amount: Decimal
    paid_amount: Decimal
    clients: list[AgentCommissionClientItem]


class AgentAwardItem(BaseModel):
    """Премия «Лучший месяца» в выплатах агентам."""

    id: UUID
    month: str
    agent_id: UUID
    agent_name: str
    inn: str | None
    points: int
    amount: Decimal
    paid: bool
    paid_at: datetime | None = None


class AgentCommissionsOverview(BaseModel):
    month: str
    commission_per_client: Decimal
    clients_count: int
    total_amount: Decimal
    to_pay_amount: Decimal
    paid_amount: Decimal
    outstanding_to_pay_amount: Decimal
    agents: list[AgentCommissionAgentRow]
    awards: list[AgentAwardItem] = []


class AgentAwardPaidUpdate(BaseModel):
    paid: bool


RankingPeriod = Literal["month", "all"]


class AgentRankingEntry(BaseModel):
    place: int
    # Только для офиса — ссылка на карточку; агентам чужие id не отдаём.
    agent_id: UUID | None = None
    name: str
    points: int
    visits: int
    contracts: int
    wins: int
    is_me: bool


class AgentRankingMe(BaseModel):
    place: int | None
    points: int
    gap_to_next: int | None


class AgentAwardWinner(BaseModel):
    month: str
    name: str
    points: int
    is_me: bool


class AgentRanking(BaseModel):
    period: RankingPeriod
    month: str
    points_visit: int
    points_contract: int
    bonus_amount: Decimal
    bonus_min_contracts: int
    entries: list[AgentRankingEntry]
    me: AgentRankingMe | None
    winners: list[AgentAwardWinner]


class AgentCommissionBulkUpdate(BaseModel):
    client_ids: list[UUID]
    collected: bool


class AgentCommissionBulkResult(BaseModel):
    updated_count: int
