from uuid import UUID

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.core.config import settings
from app.core.database import get_db
from app.core.security import TOKEN_TYPE_ACCESS, decode_token, validate_token_type
from app.models.enums import UserRole
from app.models.user import User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{settings.API_PREFIX}/auth/login")
optional_oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl=f"{settings.API_PREFIX}/auth/login",
    auto_error=False,
)


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Неверный или просроченный токен",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        payload = decode_token(token)
        validate_token_type(payload, TOKEN_TYPE_ACCESS)
        user_id = UUID(payload["sub"])
    except (JWTError, KeyError, ValueError):
        raise credentials_exception from None

    user = db.scalar(select(User).options(joinedload(User.organization)).where(User.id == user_id))
    if user is None or not user.is_active:
        raise credentials_exception

    return user


def get_current_active_user(
    current_user: User = Depends(get_current_user),
) -> User:
    if not current_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Пользователь деактивирован",
        )
    return current_user


def require_roles(*allowed_roles: UserRole):
    async def role_checker(
        current_user: User = Depends(get_current_active_user),
    ) -> User:
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Недостаточно прав для выполнения операции",
            )
        return current_user

    return role_checker


require_owner = require_roles(UserRole.OWNER)
require_owner_or_manager = require_roles(
    UserRole.OWNER,
    UserRole.MANAGER,
    UserRole.HEAD_MANAGER,
)
require_legal_staff = require_roles(
    UserRole.OWNER,
    UserRole.MANAGER,
    UserRole.HEAD_MANAGER,
    UserRole.CALL_CENTER,
)
require_civil_staff = require_roles(UserRole.OWNER, UserRole.MANAGER, UserRole.EXECUTOR)
require_lead_user = require_roles(
    UserRole.OWNER,
    UserRole.MANAGER,
    UserRole.HEAD_MANAGER,
    UserRole.CALL_CENTER,
    UserRole.AGENT,
)
require_agent = require_roles(UserRole.AGENT)
require_any_authenticated = get_current_active_user


def forbid_agents(
    token: str | None = Depends(optional_oauth2_scheme),
    db: Session = Depends(get_db),
) -> None:
    """Вешается на роутеры офиса: удалённому менеджеру доступны только лиды и кабинет.
    Сам токен здесь не проверяется — это делают зависимости эндпоинтов."""
    if not token:
        return
    try:
        payload = decode_token(token)
        user_id = UUID(payload["sub"])
    except (JWTError, KeyError, ValueError):
        return
    role = db.scalar(select(User.role).where(User.id == user_id))
    if role == UserRole.AGENT:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Раздел недоступен удалённому менеджеру",
        )
