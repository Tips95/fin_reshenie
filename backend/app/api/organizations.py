from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_active_user, require_payment_reminder_staff
from app.core.database import get_db
from app.models.enums import UserRole
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
)
GREEN_API_FIELDS = (
    "green_api_url",
    "green_api_id_instance",
    "green_api_token_instance",
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
    current_user: User = Depends(require_payment_reminder_staff),
    db: Session = Depends(get_db),
) -> OrganizationResponse:
    organization = db.get(Organization, current_user.organization_id)
    if organization is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Организация не найдена")

    updates = payload.model_dump(exclude_unset=True)
    if not updates:
        return serialize_organization(organization)

    is_owner = current_user.role == UserRole.OWNER
    if not is_owner and any(key not in GREEN_API_FIELDS for key in updates):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Коллектор может менять только настройки WhatsApp / Green API",
        )

    if is_owner and "name" in updates and updates["name"] is not None:
        organization.name = " ".join(updates["name"].strip().split())

    if is_owner:
        for field in FEATURE_FIELDS:
            if field in updates and updates[field] is not None:
                setattr(organization, field, updates[field])

    if "green_api_url" in updates:
        value = updates["green_api_url"]
        organization.green_api_url = value or None
    if "green_api_id_instance" in updates:
        value = updates["green_api_id_instance"]
        organization.green_api_id_instance = value or None
    if "green_api_token_instance" in updates:
        value = updates["green_api_token_instance"]
        # Пустую строку не принимаем как сброс — чтобы форма без ввода токена
        # не затирала сохранённый секрет.
        if value:
            organization.green_api_token_instance = value

    db.commit()
    db.refresh(organization)
    return serialize_organization(organization)
