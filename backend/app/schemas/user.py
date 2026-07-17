from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.models.enums import UserRole


class UserCreate(BaseModel):
    full_name: str = Field(min_length=1, max_length=255)
    phone: str | None = Field(default=None, max_length=32)
    email: EmailStr | None = None
    password: str = Field(min_length=6, max_length=128)
    role: UserRole
    is_active: bool = True


class RetailInvestorCreate(BaseModel):
    full_name: str = Field(min_length=1, max_length=255)
    phone: str | None = Field(default=None, max_length=32)
    email: EmailStr | None = None
    password: str = Field(min_length=6, max_length=128)
    investment_amount: Decimal = Field(default=Decimal("0.00"), ge=0, decimal_places=2)
    is_active: bool = True


class RetailInvestorUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=1, max_length=255)
    phone: str | None = Field(default=None, max_length=32)
    email: EmailStr | None = None
    investment_amount: Decimal | None = Field(default=None, ge=0, decimal_places=2)
    is_active: bool | None = None


class UserUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=1, max_length=255)
    phone: str | None = Field(default=None, max_length=32)
    email: EmailStr | None = None
    password: str | None = Field(default=None, min_length=6, max_length=128)
    role: UserRole | None = None
    is_active: bool | None = None


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    full_name: str
    phone: str | None
    email: str | None
    role: UserRole
    is_active: bool
    investment_amount: Decimal | None = None
    created_at: datetime
