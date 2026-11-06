from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_active_user
from app.core.config import settings
from app.core.database import get_db
from app.models.user import User
from app.schemas.agent import AgentRegisterRequest, AgentSignupInfo
from app.schemas.auth import (
    LoginRequest,
    RefreshRequest,
    RegisterRequest,
    TokenResponse,
    UserResponse,
)
from app.schemas.organization import organization_features
from app.services.accounts import register_organization
from app.services.agents import (
    find_signup_organization,
    inactive_agent_login_message,
    register_agent,
)
from app.services.auth import (
    authenticate_user,
    find_inactive_user,
    issue_tokens,
    refresh_access_token,
)

router = APIRouter()


def _user_response(user: User) -> UserResponse:
    return UserResponse(
        id=user.id,
        organization_id=user.organization_id,
        organization_name=user.organization.name,
        organization_type=user.organization.organization_type,
        organization_features=organization_features(user.organization),
        full_name=user.full_name,
        phone=user.phone,
        email=user.email,
        role=user.role,
        is_active=user.is_active,
    )


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    user = authenticate_user(db, payload.login, payload.password)
    if user is None:
        message = inactive_agent_login_message(find_inactive_user(db, payload.login, payload.password))
        if message:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=message)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверный логин или пароль",
        )
    return issue_tokens(user)


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest, db: Session = Depends(get_db)) -> TokenResponse:
    """Регистрирует компанию с её руководителем и сразу выдаёт токены."""
    if not settings.ALLOW_ORGANIZATION_SIGNUP:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Регистрация новых компаний закрыта",
        )
    owner = register_organization(
        db,
        organization_name=payload.organization_name,
        login=payload.login,
        password=payload.password,
        owner_name=payload.full_name,
    )
    return issue_tokens(owner)


@router.get("/agent-signup", response_model=AgentSignupInfo)
def agent_signup_info(db: Session = Depends(get_db)) -> AgentSignupInfo:
    organization = find_signup_organization(db)
    if organization is None:
        return AgentSignupInfo(open=False)
    return AgentSignupInfo(open=True, organization_name=organization.name)


@router.post("/register-agent", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register_agent_endpoint(
    payload: AgentRegisterRequest,
    db: Session = Depends(get_db),
) -> TokenResponse:
    """Удалённый менеджер принимает соглашение и сразу входит в кабинет."""
    return issue_tokens(register_agent(db, payload))


@router.post("/refresh", response_model=TokenResponse)
def refresh(payload: RefreshRequest, db: Session = Depends(get_db)) -> TokenResponse:
    return refresh_access_token(db, payload.refresh_token)


@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_active_user)) -> UserResponse:
    return _user_response(current_user)
