from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.enums import OrganizationType
from app.services.green_api import credentials_from_env, credentials_from_organization


class OrganizationFeatures(BaseModel):
    document_collection: bool = True
    tasks: bool = True
    expenses: bool = True
    pricing: bool = True
    analytics: bool = True


class OrganizationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    organization_type: OrganizationType
    features: OrganizationFeatures
    created_at: datetime
    green_api_configured: bool = False
    green_api_url: str | None = None
    green_api_id_instance: str | None = None
    green_api_token_set: bool = False
    green_api_from_env: bool = False


class OrganizationUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=255)
    feature_document_collection: bool | None = None
    feature_tasks: bool | None = None
    feature_expenses: bool | None = None
    feature_pricing: bool | None = None
    feature_analytics: bool | None = None
    green_api_url: str | None = Field(default=None, max_length=255)
    green_api_id_instance: str | None = Field(default=None, max_length=64)
    # Пустая строка = не менять токен; None в exclude_unset = не трогать.
    green_api_token_instance: str | None = Field(default=None, max_length=255)

    @field_validator("green_api_url", "green_api_id_instance", "green_api_token_instance", mode="before")
    @classmethod
    def strip_optional(cls, value: object) -> object:
        if value is None:
            return None
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            return str(int(value)) if float(value).is_integer() else str(value)
        if isinstance(value, str):
            return value.strip().strip('"').strip("'").strip()
        return value


def organization_features(organization) -> OrganizationFeatures:
    return OrganizationFeatures(
        document_collection=bool(getattr(organization, "feature_document_collection", True)),
        tasks=bool(getattr(organization, "feature_tasks", True)),
        expenses=bool(getattr(organization, "feature_expenses", True)),
        pricing=bool(getattr(organization, "feature_pricing", True)),
        analytics=bool(getattr(organization, "feature_analytics", True)),
    )


def serialize_organization(organization) -> OrganizationResponse:
    org_creds = credentials_from_organization(organization)
    env_creds = credentials_from_env()
    active = org_creds or env_creds
    return OrganizationResponse(
        id=organization.id,
        name=organization.name,
        organization_type=organization.organization_type,
        features=organization_features(organization),
        created_at=organization.created_at,
        green_api_configured=active is not None,
        green_api_url=active.api_url if active else None,
        green_api_id_instance=active.id_instance if active else None,
        green_api_token_set=active is not None,
        green_api_from_env=bool(env_creds and not org_creds),
    )
