from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import require_owner
from app.core.database import get_db
from app.core.security import get_password_hash
from app.models.enums import AuditAction, OrganizationType, UserRole
from app.models.user import User
from app.schemas.user import UserCreate, UserResponse, UserUpdate
from app.services.access import get_organization_user
from app.services.accounts import assert_contacts_available
from app.services.audit import log_audit

router = APIRouter()

LEGAL_TEAM_ROLES = {UserRole.OWNER, UserRole.MANAGER, UserRole.CALL_CENTER, UserRole.EXECUTOR}
RETAIL_TEAM_ROLES = {UserRole.OWNER, UserRole.MANAGER, UserRole.CALL_CENTER}
INVESTOR_VIA_USERS_MESSAGE = "Инвесторов добавляйте в разделе «Инвесторы»"


def _assert_team_role(role: UserRole, *, organization_type: OrganizationType) -> None:
    if role == UserRole.INVESTOR:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=INVESTOR_VIA_USERS_MESSAGE
            if organization_type == OrganizationType.RETAIL
            else "Роль инвестора доступна только в товарной рассрочке",
        )
    allowed = RETAIL_TEAM_ROLES if organization_type == OrganizationType.RETAIL else LEGAL_TEAM_ROLES
    if role == UserRole.EXECUTOR and organization_type != OrganizationType.BANKRUPTCY:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Роль исполнителя доступна только в юридической компании",
        )
    if role not in allowed:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Недопустимая роль для команды",
        )


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

    assert_contacts_available(
        db,
        organization_type=current_user.organization.organization_type,
        email=payload.email,
        phone=payload.phone,
    )
    _assert_team_role(payload.role, organization_type=current_user.organization.organization_type)

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

    if "email" in updates or "phone" in updates:
        assert_contacts_available(
            db,
            organization_type=current_user.organization.organization_type,
            email=updates.get("email", user.email),
            phone=updates.get("phone", user.phone),
            exclude_user_id=user.id,
        )

    if "role" in updates:
        _assert_team_role(
            updates["role"],
            organization_type=current_user.organization.organization_type,
        )

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
