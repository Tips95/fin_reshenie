from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import require_owner
from app.core.database import get_db
from app.core.security import get_password_hash
from app.models.enums import AuditAction
from app.models.user import User
from app.schemas.user import UserCreate, UserResponse, UserUpdate
from app.services.access import get_organization_user
from app.services.audit import log_audit

router = APIRouter()


@router.get("", response_model=list[UserResponse])
def list_users(
    current_user: User = Depends(require_owner),
    db: Session = Depends(get_db),
) -> list[User]:
    stmt = select(User).where(User.organization_id == current_user.organization_id).order_by(User.full_name)
    return list(db.scalars(stmt))


@router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def create_user(
    payload: UserCreate,
    current_user: User = Depends(require_owner),
    db: Session = Depends(get_db),
) -> User:
    if not payload.email and not payload.phone:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Укажите email или телефон",
        )

    user = User(
        organization_id=current_user.organization_id,
        full_name=payload.full_name,
        phone=payload.phone,
        email=payload.email,
        password_hash=get_password_hash(payload.password),
        role=payload.role,
        is_active=payload.is_active,
    )
    db.add(user)
    db.flush()

    log_audit(
        db,
        user=current_user,
        entity_type="user",
        entity_id=user.id,
        action=AuditAction.CREATE,
    )
    db.commit()
    db.refresh(user)
    return user


@router.get("/{user_id}", response_model=UserResponse)
def get_user(
    user_id: UUID,
    current_user: User = Depends(require_owner),
    db: Session = Depends(get_db),
) -> User:
    return get_organization_user(db, user_id=user_id, organization_id=current_user.organization_id)


@router.patch("/{user_id}", response_model=UserResponse)
def update_user(
    user_id: UUID,
    payload: UserUpdate,
    current_user: User = Depends(require_owner),
    db: Session = Depends(get_db),
) -> User:
    user = get_organization_user(db, user_id=user_id, organization_id=current_user.organization_id)
    updates = payload.model_dump(exclude_unset=True)

    if "password" in updates:
        updates["password_hash"] = get_password_hash(updates.pop("password"))

    for field, value in updates.items():
        old_value = getattr(user, field)
        if old_value != value:
            log_audit(
                db,
                user=current_user,
                entity_type="user",
                entity_id=user.id,
                action=AuditAction.UPDATE,
                field_name=field,
                old_value=old_value,
                new_value=value,
            )
            setattr(user, field, value)

    db.commit()
    db.refresh(user)
    return user


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def deactivate_user(
    user_id: UUID,
    current_user: User = Depends(require_owner),
    db: Session = Depends(get_db),
) -> None:
    user = get_organization_user(db, user_id=user_id, organization_id=current_user.organization_id)
    if user.id == current_user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Нельзя деактивировать себя")

    user.is_active = False
    log_audit(
        db,
        user=current_user,
        entity_type="user",
        entity_id=user.id,
        action=AuditAction.UPDATE,
        field_name="is_active",
        old_value=True,
        new_value=False,
    )
    db.commit()
