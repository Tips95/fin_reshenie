import secrets
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import require_owner
from app.core.database import get_db
from app.core.security import get_password_hash
from app.models.enums import AuditAction, UserRole
from app.models.user import User
from app.schemas.user import UserCreate, UserResponse, UserUpdate
from app.services.access import get_organization_user
from app.services.accounts import assert_contacts_available
from app.services.agents import CURATOR_ROLES
from app.services.audit import log_audit
from app.services.client_duplicates import phones_equivalent

router = APIRouter()

TEAM_ROLES = {
    UserRole.OWNER,
    UserRole.MANAGER,
    UserRole.HEAD_MANAGER,
    UserRole.CALL_CENTER,
    UserRole.EXECUTOR,
}


def _assert_team_role(role: UserRole) -> None:
    if role not in TEAM_ROLES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Недопустимая роль для команды",
        )


def _assert_curator_role(role: UserRole, is_agent_curator: bool) -> None:
    if is_agent_curator and role not in CURATOR_ROLES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Куратором может быть менеджер, начальник отдела или руководитель",
        )


@router.get("", response_model=list[UserResponse])
def list_users(
    current_user: User = Depends(require_owner),
    db: Session = Depends(get_db),
) -> list[User]:
    stmt = (
        select(User)
        .where(User.organization_id == current_user.organization_id, User.deleted_at.is_(None))
        .order_by(User.full_name)
    )
    return list(db.scalars(stmt))


def _get_live_user(db: Session, user_id: UUID, current_user: User) -> User:
    user = get_organization_user(db, user_id=user_id, organization_id=current_user.organization_id)
    if user.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Пользователь удалён")
    return user


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
    _assert_team_role(payload.role)
    _assert_curator_role(payload.role, payload.is_agent_curator)

    user = User(
        organization_id=current_user.organization_id,
        full_name=payload.full_name,
        phone=payload.phone,
        email=payload.email,
        telegram=payload.telegram,
        password_hash=get_password_hash(payload.password),
        role=payload.role,
        is_active=payload.is_active,
        is_agent_curator=payload.is_agent_curator,
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
    return _get_live_user(db, user_id, current_user)


@router.patch("/{user_id}", response_model=UserResponse)
def update_user(
    user_id: UUID,
    payload: UserUpdate,
    current_user: User = Depends(require_owner),
    db: Session = Depends(get_db),
) -> User:
    user = _get_live_user(db, user_id, current_user)
    updates = payload.model_dump(exclude_unset=True)

    if "email" in updates or "phone" in updates:
        new_email = updates.get("email", user.email)
        new_phone = updates.get("phone", user.phone)
        # Смена только фамилии не должна упираться в проверку логина:
        # email и телефон в форме те же, что уже сохранены.
        email_changed = (user.email or "").strip().lower() != (new_email or "").strip().lower()
        old_phone = (user.phone or "").strip()
        next_phone = (new_phone or "").strip()
        phone_changed = bool(old_phone or next_phone) and not phones_equivalent(old_phone, next_phone)
        if email_changed or phone_changed:
            assert_contacts_available(
                db,
                organization_type=current_user.organization.organization_type,
                email=new_email,
                phone=new_phone,
                exclude_user_id=user.id,
            )

    if "role" in updates:
        _assert_team_role(updates["role"])
    if "role" in updates or "is_agent_curator" in updates:
        _assert_curator_role(
            updates.get("role", user.role),
            updates.get("is_agent_curator", user.is_agent_curator),
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


def _remove_user(db: Session, user: User, current_user: User) -> None:
    """Удаление без потери истории: платежи и журнал ссылаются на сотрудника,
    поэтому запись остаётся, но скрыта, без входа и с освобождённым логином."""
    log_audit(
        db,
        user=current_user,
        entity_type="user",
        entity_id=user.id,
        action=AuditAction.DELETE,
        old_value=" · ".join(filter(None, [user.full_name, user.email, user.phone])),
    )
    for agent in db.scalars(select(User).where(User.curator_id == user.id)):
        agent.curator_id = None
    user.deleted_at = datetime.now(timezone.utc)
    user.is_active = False
    user.is_agent_curator = False
    user.email = None
    user.phone = None
    user.telegram = None
    user.password_hash = get_password_hash(secrets.token_urlsafe(32))


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def deactivate_user(
    user_id: UUID,
    permanent: bool = False,
    current_user: User = Depends(require_owner),
    db: Session = Depends(get_db),
) -> None:
    user = _get_live_user(db, user_id, current_user)
    if user.id == current_user.id:
        detail = "Нельзя удалить себя" if permanent else "Нельзя деактивировать себя"
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)

    if permanent:
        _remove_user(db, user, current_user)
        db.commit()
        return

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
