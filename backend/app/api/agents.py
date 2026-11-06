from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import require_agent, require_owner
from app.core.database import get_db
from app.models.user import User
from app.schemas.agent import (
    AgentCommissionBulkResult,
    AgentCommissionBulkUpdate,
    AgentCommissionsOverview,
    AgentCuratorUpdate,
    AgentOverview,
    AgentResponse,
    AgentSignupSettings,
)
from app.services.agents import (
    get_agent_commissions_overview,
    get_agent_overview,
    list_agents,
    set_agent_commission_collected,
    set_agent_curator,
    set_agent_signup_open,
)

router = APIRouter()


def _agent_response(db: Session, owner: User, agent_id: UUID) -> AgentResponse:
    return next(item for item in list_agents(db, owner) if item.id == agent_id)


@router.get("/me/overview", response_model=AgentOverview)
def my_overview(
    current_user: User = Depends(require_agent),
    db: Session = Depends(get_db),
) -> AgentOverview:
    return get_agent_overview(db, current_user)


@router.get("/signup", response_model=AgentSignupSettings)
def get_signup(current_user: User = Depends(require_owner)) -> AgentSignupSettings:
    return AgentSignupSettings(open=current_user.organization.agent_signup_open)


@router.put("/signup", response_model=AgentSignupSettings)
def put_signup(
    payload: AgentSignupSettings,
    current_user: User = Depends(require_owner),
    db: Session = Depends(get_db),
) -> AgentSignupSettings:
    """Кнопка регистрации на сайте: открыть или закрыть набор удалённых менеджеров."""
    return AgentSignupSettings(open=set_agent_signup_open(db, current_user, payload.open))


@router.get("", response_model=list[AgentResponse])
def get_agents(
    current_user: User = Depends(require_owner),
    db: Session = Depends(get_db),
) -> list[AgentResponse]:
    return list_agents(db, current_user)


@router.patch("/{agent_id}/curator", response_model=AgentResponse)
def patch_curator(
    agent_id: UUID,
    payload: AgentCuratorUpdate,
    current_user: User = Depends(require_owner),
    db: Session = Depends(get_db),
) -> AgentResponse:
    set_agent_curator(db, current_user, agent_id, payload.curator_id)
    return _agent_response(db, current_user, agent_id)


@router.get("/commissions", response_model=AgentCommissionsOverview)
def get_commissions(
    month: str = Query(..., pattern=r"^\d{4}-\d{2}$"),
    current_user: User = Depends(require_owner),
    db: Session = Depends(get_db),
) -> AgentCommissionsOverview:
    """5 000 ₽ агенту за каждого клиента, внёсшего в месяце первый платёж по договору."""
    return get_agent_commissions_overview(db, current_user, month=month)


@router.post("/commissions/mark", response_model=AgentCommissionBulkResult)
def mark_commissions(
    payload: AgentCommissionBulkUpdate,
    current_user: User = Depends(require_owner),
    db: Session = Depends(get_db),
) -> AgentCommissionBulkResult:
    updated = set_agent_commission_collected(db, current_user, payload.client_ids, payload.collected)
    return AgentCommissionBulkResult(updated_count=updated)
