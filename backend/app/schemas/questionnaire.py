from datetime import date, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.services.questionnaire_defaults import (
    empty_debts,
    merge_assets,
    merge_documents,
    normalize_debts,
)


class QuestionnaireDebt(BaseModel):
    creditor: str = ""
    origin_date: date | None = None
    monthly_payment: str = ""
    overdue_start_date: date | None = None
    debt_amount: str = ""


class QuestionnaireAsset(BaseModel):
    key: str
    label: str
    debtor: bool | None = None
    spouse: bool | None = None


class QuestionnaireDocument(BaseModel):
    key: str
    label: str
    collected: bool = False
    extra_info: str = ""


class QuestionnaireBase(BaseModel):
    full_name: str = Field(min_length=2, max_length=255)
    service_cost: Decimal | None = Field(default=None, ge=0, decimal_places=2)
    phone: str = Field(default="", max_length=32)
    registration_region: str | None = Field(default=None, max_length=255)
    fake_income_documents: bool | None = None
    bank_accounts: str | None = None
    has_guarantee_or_collateral: bool | None = None
    is_married: bool | None = None
    divorce_info: str | None = Field(default=None, max_length=255)
    dependents: str | None = Field(default=None, max_length=255)
    income_debtor: str | None = Field(default=None, max_length=255)
    income_spouse: str | None = Field(default=None, max_length=255)
    income_destination: str | None = None
    has_property_encumbrance: bool | None = None
    property_encumbrance_details: str | None = None
    has_recent_property_deals: bool | None = None
    recent_property_deals_details: str | None = None
    property_debtor: str | None = None
    property_spouse: str | None = None
    has_weapon: bool | None = None
    weapon_details: str | None = None
    notes: str | None = None
    filled_date: date | None = None
    debts: list[QuestionnaireDebt] = Field(default_factory=lambda: [
        QuestionnaireDebt.model_validate(row) for row in empty_debts()
    ])
    assets: list[QuestionnaireAsset] | None = None
    documents: list[QuestionnaireDocument] | None = None

    @field_validator("full_name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        return " ".join(value.strip().split())

    @field_validator("phone")
    @classmethod
    def normalize_phone(cls, value: str) -> str:
        return value.strip()

    @field_validator("debts", mode="before")
    @classmethod
    def coerce_debts(cls, value: Any) -> list[dict[str, Any]]:
        return normalize_debts(value)

    @field_validator("assets", mode="before")
    @classmethod
    def coerce_assets(cls, value: Any) -> list[dict[str, Any]] | None:
        if value is None:
            return None
        return merge_assets(value)

    @field_validator("documents", mode="before")
    @classmethod
    def coerce_documents(cls, value: Any) -> list[dict[str, Any]] | None:
        if value is None:
            return None
        return merge_documents(value)


class QuestionnaireCreate(QuestionnaireBase):
    client_id: UUID | None = None


class QuestionnaireUpdate(QuestionnaireBase):
    client_id: UUID | None = None


class QuestionnaireCreateClientRequest(BaseModel):
    contract_date: date | None = None


class QuestionnaireBrief(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    client_id: UUID | None
    full_name: str
    phone: str
    registration_region: str | None
    service_cost: Decimal | None
    filled_date: date | None
    created_by_id: UUID | None
    created_by_name: str | None = None
    created_at: datetime
    updated_at: datetime


class QuestionnaireResponse(QuestionnaireBrief):
    fake_income_documents: bool | None
    bank_accounts: str | None
    has_guarantee_or_collateral: bool | None
    is_married: bool | None
    divorce_info: str | None
    dependents: str | None
    income_debtor: str | None
    income_spouse: str | None
    income_destination: str | None
    has_property_encumbrance: bool | None
    property_encumbrance_details: str | None
    has_recent_property_deals: bool | None
    recent_property_deals_details: str | None
    property_debtor: str | None = None
    property_spouse: str | None = None
    has_weapon: bool | None = None
    weapon_details: str | None = None
    notes: str | None
    debts: list[QuestionnaireDebt]
    assets: list[QuestionnaireAsset]
    documents: list[QuestionnaireDocument]
