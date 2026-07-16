from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import OrganizationType, UserRole


class LoginRequest(BaseModel):
    login: str = Field(min_length=1, description="Email или телефон")
    password: str = Field(min_length=1)
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
    full_name: str
    phone: str | None
    email: str | None
    role: UserRole
    is_active: bool
