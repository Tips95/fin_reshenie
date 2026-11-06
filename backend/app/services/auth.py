from uuid import UUID

from fastapi import HTTPException, status
from jose import JWTError
from sqlalchemy import or_, select
from sqlalchemy.orm import Session, joinedload

from app.core.security import (
    TOKEN_TYPE_REFRESH,
    create_access_token,
    create_refresh_token,
    decode_token,
    validate_token_type,
    verify_password,
)
from app.models.enums import OrganizationType
from app.models.user import User
from app.schemas.auth import TokenResponse

def get_user_by_login(db: Session, login: str, *, include_inactive: bool = False) -> User | None:
    normalized_login = login.strip()
    stmt = (
        select(User)
        .options(joinedload(User.organization))
        .where(
            or_(User.email == normalized_login, User.phone == normalized_login),
            User.organization.has(organization_type=OrganizationType.BANKRUPTCY),
        )
    )
    if not include_inactive:
        stmt = stmt.where(User.is_active.is_(True))
    return db.scalars(stmt).unique().first()


def authenticate_user(db: Session, login: str, password: str) -> User | None:
    user = get_user_by_login(db, login)
    if user is None or not verify_password(password, user.password_hash):
        return None
    return user


def find_inactive_user(db: Session, login: str, password: str) -> User | None:
    """Неактивный пользователь с верным паролем — чтобы объяснить агенту,
    что заявка ещё не подтверждена, а не «неверный пароль»."""
    user = get_user_by_login(db, login, include_inactive=True)
    if user is None or user.is_active or not verify_password(password, user.password_hash):
        return None
    return user


def issue_tokens(user: User) -> TokenResponse:
    role = user.role.value
    access_token = create_access_token(
        subject=user.id,
        organization_id=user.organization_id,
        role=role,
    )
    refresh_token = create_refresh_token(
        subject=user.id,
        organization_id=user.organization_id,
        role=role,
    )
    return TokenResponse(access_token=access_token, refresh_token=refresh_token)


def refresh_access_token(db: Session, refresh_token: str) -> TokenResponse:
    try:
        payload = decode_token(refresh_token)
        validate_token_type(payload, TOKEN_TYPE_REFRESH)
        user_id = UUID(payload["sub"])
    except (JWTError, KeyError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверный или просроченный refresh-токен",
        ) from exc

    user = db.get(User, user_id)
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Пользователь не найден или деактивирован",
        )

    return issue_tokens(user)
