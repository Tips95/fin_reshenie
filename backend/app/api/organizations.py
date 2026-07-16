from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_active_user, require_owner
from app.core.database import get_db
from app.models.organization import Organization
from app.models.user import User
from app.schemas.organization import OrganizationResponse, OrganizationUpdate

router = APIRouter()


@router.get("/current", response_model=OrganizationResponse)
def get_current_organization(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> Organization:
    return db.get(Organization, current_user.organization_id)


@router.patch("/current", response_model=OrganizationResponse)
def update_current_organization(
    payload: OrganizationUpdate,
    current_user: User = Depends(require_owner),
    db: Session = Depends(get_db),
) -> Organization:
    organization = db.get(Organization, current_user.organization_id)
    organization.name = payload.name
    db.commit()
    db.refresh(organization)
    return organization
