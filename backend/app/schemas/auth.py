from typing import Literal
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import OrganizationType, UserRole
from app.schemas.organization import OrganizationFeatures, organization_features


class LoginRequest(BaseModel):
    login: str = Field(min_length=1, description="Email или телефон")
    password: str = Field(min_length=1)
    workspace: Literal["legal", "retail"] = "legal"


class RegisterRequest(BaseModel):
    """Регистрация компании: название, логин и пароль. Имя руководителя
    необязательно — его можно заполнить позже в «Команде»."""

    organization_name: str = Field(min_length=2, max_length=255)
    login: str = Field(min_length=3, max_length=255, description="Email или телефон")
    password: str = Field(min_length=6, max_length=128)
    full_name: str | None = Field(default=None, max_length=255)
    workspace: Literal["legal", "retail"] = "legal"


class RefreshRequest(BaseModel):
    refresh_token: str = Field(min_length=1)


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    organization_name: str
    organization_type: OrganizationType
    organization_features: OrganizationFeatures
    full_name: str
    phone: str | None
    email: str | None
    role: UserRole
    is_active: bool
    investment_amount: Decimal | None = None
