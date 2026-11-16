from uuid import UUID

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.deps import require_lead_user
from app.core.database import get_db
from app.models.user import User
from app.schemas.agent import AgentChatMessage, AgentChatSend, AgentChatThread, WhatsAppGroup
from app.services.agent_chat import (
    list_personal,
    list_shared,
    list_threads,
    send_personal,
    send_shared,
    set_whatsapp_group,
)

router = APIRouter()


@router.get("/threads", response_model=list[AgentChatThread])
def get_threads(
    current_user: User = Depends(require_lead_user),
    db: Session = Depends(get_db),
) -> list[AgentChatThread]:
    return list_threads(db, current_user)


@router.get("/personal", response_model=list[AgentChatMessage])
def get_personal(
    agent_id: UUID | None = None,
    current_user: User = Depends(require_lead_user),
    db: Session = Depends(get_db),
) -> list[AgentChatMessage]:
    """Агент читает свой тред; офис передаёт agent_id."""
    return list_personal(db, current_user, agent_id)


@router.post("/personal", response_model=AgentChatMessage, status_code=status.HTTP_201_CREATED)
def post_personal(
    payload: AgentChatSend,
    agent_id: UUID | None = None,
    current_user: User = Depends(require_lead_user),
    db: Session = Depends(get_db),
) -> AgentChatMessage:
    return send_personal(db, current_user, agent_id, payload.body)


@router.get("/shared", response_model=list[AgentChatMessage])
def get_shared(
    current_user: User = Depends(require_lead_user),
    db: Session = Depends(get_db),
) -> list[AgentChatMessage]:
    return list_shared(db, current_user)


@router.post("/shared", response_model=AgentChatMessage, status_code=status.HTTP_201_CREATED)
def post_shared(
    payload: AgentChatSend,
    current_user: User = Depends(require_lead_user),
    db: Session = Depends(get_db),
) -> AgentChatMessage:
    return send_shared(db, current_user, payload.body)


@router.get("/whatsapp-group", response_model=WhatsAppGroup)
def get_whatsapp_group(current_user: User = Depends(require_lead_user)) -> WhatsAppGroup:
    return WhatsAppGroup(url=current_user.whatsapp_group_url)


@router.put("/whatsapp-group", response_model=WhatsAppGroup)
def put_whatsapp_group(
    payload: WhatsAppGroup,
    current_user: User = Depends(require_lead_user),
    db: Session = Depends(get_db),
) -> WhatsAppGroup:
    return WhatsAppGroup(url=set_whatsapp_group(db, current_user, payload.url))
