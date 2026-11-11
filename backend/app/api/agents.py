from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import require_agent, require_lead_user, require_owner, require_owner_or_manager
from app.core.database import get_db
from app.core.time import local_today
from app.models.document_collection import DOCUMENT_COLLECTION_TOTAL
from app.models.user import User
from app.schemas.agent import (
    AgentActiveUpdate,
    AgentCommissionBulkResult,
    AgentCommissionBulkUpdate,
    AgentCommissionsOverview,
    AgentCuratorOption,
    AgentCuratorUpdate,
    AgentDetail,
    AgentNoteUpdate,
    AgentOverview,
    AgentResponse,
    AgentSignupSettings,
)
from app.schemas.pricing_tier import PriceListResponse
from app.services.access import list_current_pricing_tiers
from app.services.agents import (
    get_agent_commissions_overview,
    get_agent_overview,
    get_organization_agent,
    list_agents,
    list_curators,
    set_agent_active,
    set_agent_commission_collected,
    set_agent_curator,
    set_agent_note,
    set_agent_signup_open,
)
from app.services.default_pricing_tiers import MIN_DEBT_AMOUNT

router = APIRouter()


def _agent_response(db: Session, user: User, agent_id: UUID) -> AgentResponse:
    return list_agents(db, user, agent_id=agent_id)[0]


@router.get("/me/overview", response_model=AgentOverview)
def my_overview(
    current_user: User = Depends(require_agent),
    db: Session = Depends(get_db),
) -> AgentOverview:
    return get_agent_overview(db, current_user)


@router.get("/price-list", response_model=PriceListResponse)
def get_price_list(
    current_user: User = Depends(require_lead_user),
    db: Session = Depends(get_db),
) -> PriceListResponse:
    """Прайс открыт удалённым менеджерам: им нужно называть клиенту стоимость."""
    return PriceListResponse(
        min_debt_amount=MIN_DEBT_AMOUNT,
        document_collection_total=DOCUMENT_COLLECTION_TOTAL,
        tiers=list_current_pricing_tiers(
            db, organization_id=current_user.organization_id, today=local_today()
        ),
    )


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
    current_user: User = Depends(require_owner_or_manager),
    db: Session = Depends(get_db),
) -> list[AgentResponse]:
    """Менеджер видит только своих подопечных."""
    return list_agents(db, current_user)


@router.get("/curators", response_model=list[AgentCuratorOption])
def get_curators(
    current_user: User = Depends(require_owner_or_manager),
    db: Session = Depends(get_db),
) -> list[AgentCuratorOption]:
    return [
        AgentCuratorOption(id=item.id, full_name=item.full_name, role=item.role.value)
        for item in list_curators(db, current_user)
    ]


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


@router.get("/{agent_id}", response_model=AgentDetail)
def get_agent(
    agent_id: UUID,
    current_user: User = Depends(require_owner_or_manager),
    db: Session = Depends(get_db),
) -> AgentDetail:
    agent = get_organization_agent(db, agent_id=agent_id, user=current_user)
    return AgentDetail(
        agent=_agent_response(db, current_user, agent.id),
        overview=get_agent_overview(db, agent),
    )


@router.patch("/{agent_id}/curator", response_model=AgentResponse)
def patch_curator(
    agent_id: UUID,
    payload: AgentCuratorUpdate,
    current_user: User = Depends(require_owner_or_manager),
    db: Session = Depends(get_db),
) -> AgentResponse:
    set_agent_curator(db, current_user, agent_id, payload.curator_id)
    return _agent_response(db, current_user, agent_id)


@router.patch("/{agent_id}/active", response_model=AgentResponse)
def patch_active(
    agent_id: UUID,
    payload: AgentActiveUpdate,
    current_user: User = Depends(require_owner_or_manager),
    db: Session = Depends(get_db),
) -> AgentResponse:
    set_agent_active(db, current_user, agent_id, payload.is_active)
    return _agent_response(db, current_user, agent_id)


@router.patch("/{agent_id}/note", response_model=AgentResponse)
def patch_note(
    agent_id: UUID,
    payload: AgentNoteUpdate,
    current_user: User = Depends(require_owner_or_manager),
    db: Session = Depends(get_db),
) -> AgentResponse:
    set_agent_note(db, current_user, agent_id, payload.note)
    return _agent_response(db, current_user, agent_id)
