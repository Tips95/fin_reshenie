from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.enums import CivilCaseDocumentKind, CivilCaseStage
from app.services.validation import validate_full_name, validate_phone_required


class CivilCaseCreate(BaseModel):
    full_name: str = Field(min_length=1, max_length=255)
    phone: str = Field(min_length=1, max_length=32)
    price: Decimal = Field(gt=0, decimal_places=2)
    appeal_date: date
    subject: str = Field(min_length=3, max_length=4000)
    assigned_executor_id: UUID | None = None

    @field_validator("full_name")
    @classmethod
    def check_full_name(cls, value: str) -> str:
        return validate_full_name(value)

    @field_validator("phone")
    @classmethod
    def check_phone(cls, value: str) -> str:
        return validate_phone_required(value)

    @field_validator("subject")
    @classmethod
    def check_subject(cls, value: str) -> str:
        normalized = " ".join(value.strip().split())
        if len(normalized) < 3:
            raise ValueError("Укажите предмет обращения")
        return normalized


class CivilCaseUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=1, max_length=255)
    phone: str | None = Field(default=None, min_length=1, max_length=32)
    price: Decimal | None = Field(default=None, gt=0, decimal_places=2)
    appeal_date: date | None = None
    subject: str | None = Field(default=None, min_length=3, max_length=4000)
    assigned_executor_id: UUID | None = None
    documents_prepared_at: date | None = None
    documents_note: str | None = Field(default=None, max_length=4000)
    submitted_at: date | None = None
    authority_name: str | None = Field(default=None, max_length=255)
    executed_at: date | None = None
    execution_note: str | None = Field(default=None, max_length=4000)

    @field_validator("full_name")
    @classmethod
    def check_full_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return validate_full_name(value)

    @field_validator("phone")
    @classmethod
    def check_phone(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return validate_phone_required(value)

    @field_validator("subject")
    @classmethod
    def check_subject(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = " ".join(value.strip().split())
        if len(normalized) < 3:
            raise ValueError("Укажите предмет обращения")
        return normalized

    @field_validator("authority_name", "documents_note", "execution_note")
    @classmethod
    def empty_to_none(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = " ".join(value.split())
        return normalized or None


class CivilCaseMovementCreate(BaseModel):
    body: str = Field(min_length=1, max_length=4000)

    @field_validator("body")
    @classmethod
    def check_body(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("Напишите, что изменилось по делу")
        return normalized


class CivilCaseMovementResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    body: str
    created_by_id: UUID | None
    created_by_name: str | None = None
    created_at: datetime


class CivilCaseDocumentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    kind: CivilCaseDocumentKind
    filename: str
    content_type: str
    size_bytes: int
    uploaded_by_id: UUID | None
    uploaded_by_name: str | None = None
    created_at: datetime


class CivilCaseExecutorOption(BaseModel):
    id: UUID
    full_name: str


class CivilCaseBrief(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    full_name: str
    phone: str
    price: Decimal
    appeal_date: date
    subject: str
    stage: CivilCaseStage
    assigned_executor_id: UUID | None
    assigned_executor_name: str | None = None
    created_by_id: UUID | None
    created_by_name: str | None = None
    documents_prepared_at: date | None
    submitted_at: date | None
    executed_at: date | None
    documents_count: int = 0
    client_documents_count: int = 0
    prepared_documents_count: int = 0
    created_at: datetime
    updated_at: datetime


class CivilCaseResponse(CivilCaseBrief):
    documents_note: str | None = None
    authority_name: str | None = None
    execution_note: str | None = None
    movements: list[CivilCaseMovementResponse] = []
    documents: list[CivilCaseDocumentResponse] = []
