from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_active_user, require_owner
from app.core.database import get_db
from app.models.organization import Organization
from app.models.user import User
from app.schemas.organization import (
    OrganizationResponse,
    OrganizationUpdate,
    serialize_organization,
)

router = APIRouter()

FEATURE_FIELDS = (
    "feature_document_collection",
    "feature_tasks",
    "feature_expenses",
    "feature_pricing",
    "feature_analytics",
    "feature_investors",
)


@router.get("/current", response_model=OrganizationResponse)
def get_current_organization(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> OrganizationResponse:
    organization = db.get(Organization, current_user.organization_id)
    if organization is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Организация не найдена")
    return serialize_organization(organization)


@router.patch("/current", response_model=OrganizationResponse)
def update_current_organization(
    payload: OrganizationUpdate,
    current_user: User = Depends(require_owner),
    db: Session = Depends(get_db),
) -> OrganizationResponse:
    organization = db.get(Organization, current_user.organization_id)
    if organization is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Организация не найдена")

    updates = payload.model_dump(exclude_unset=True)
    if not updates:
        return serialize_organization(organization)

    if "name" in updates and updates["name"] is not None:
        organization.name = " ".join(updates["name"].strip().split())

    for field in FEATURE_FIELDS:
        if field in updates and updates[field] is not None:
            setattr(organization, field, updates[field])

    db.commit()
    db.refresh(organization)
    return serialize_organization(organization)
