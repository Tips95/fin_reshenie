from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import OrganizationType


class OrganizationFeatures(BaseModel):
    document_collection: bool = True
    tasks: bool = True
    expenses: bool = True
    pricing: bool = True
    analytics: bool = True
    investors: bool = True


class OrganizationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    organization_type: OrganizationType
    features: OrganizationFeatures
    created_at: datetime


class OrganizationUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=255)
    feature_document_collection: bool | None = None
    feature_tasks: bool | None = None
    feature_expenses: bool | None = None
    feature_pricing: bool | None = None
    feature_analytics: bool | None = None
    feature_investors: bool | None = None


def organization_features(organization) -> OrganizationFeatures:
    return OrganizationFeatures(
        document_collection=bool(getattr(organization, "feature_document_collection", True)),
        tasks=bool(getattr(organization, "feature_tasks", True)),
        expenses=bool(getattr(organization, "feature_expenses", True)),
        pricing=bool(getattr(organization, "feature_pricing", True)),
        analytics=bool(getattr(organization, "feature_analytics", True)),
        investors=bool(getattr(organization, "feature_investors", True)),
    )


def serialize_organization(organization) -> OrganizationResponse:
    return OrganizationResponse(
        id=organization.id,
        name=organization.name,
        organization_type=organization.organization_type,
        features=organization_features(organization),
        created_at=organization.created_at,
    )
