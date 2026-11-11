from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.models.enums import UserRole
from app.schemas.agent import normalize_telegram
from app.services.validation import validate_full_name, validate_phone_optional


class UserCreate(BaseModel):
    full_name: str = Field(min_length=1, max_length=255)
    phone: str | None = Field(default=None, max_length=32)
    email: EmailStr | None = None
    telegram: str | None = Field(default=None, max_length=64)
    password: str = Field(min_length=6, max_length=128)
    role: UserRole
    is_active: bool = True
    is_agent_curator: bool = False

    @field_validator("full_name")
    @classmethod
    def check_full_name(cls, value: str) -> str:
        return validate_full_name(value)

    @field_validator("phone")
    @classmethod
    def check_phone(cls, value: str | None) -> str | None:
        return validate_phone_optional(value)

    @field_validator("telegram")
    @classmethod
    def check_telegram(cls, value: str | None) -> str | None:
        return normalize_telegram(value)


class UserUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=1, max_length=255)
    phone: str | None = Field(default=None, max_length=32)
    email: EmailStr | None = None
    telegram: str | None = Field(default=None, max_length=64)
    password: str | None = Field(default=None, min_length=6, max_length=128)
    role: UserRole | None = None
    is_active: bool | None = None
    is_agent_curator: bool | None = None

    @field_validator("telegram")
    @classmethod
    def check_telegram(cls, value: str | None) -> str | None:
        return normalize_telegram(value)


    @field_validator("full_name")
    @classmethod
    def check_full_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return validate_full_name(value)

    @field_validator("phone")
    @classmethod
    def check_phone(cls, value: str | None) -> str | None:
        return validate_phone_optional(value)


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    full_name: str
    phone: str | None
    email: str | None
    telegram: str | None = None
    role: UserRole
    is_active: bool
    is_agent_curator: bool = False
    created_at: datetime
