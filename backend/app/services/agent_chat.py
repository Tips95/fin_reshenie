"""Чат удалённых менеджеров.

Личный тред — у каждого агента с кураторами (видят его куратор и те, кто видит всех агентов).
Общая лента — вопросы всех агентов, на которые отвечают кураторы; агенты видят друг друга
по сокращённым именам, как в рейтинге.
"""

from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.models.agent_message import AgentMessage
from app.models.enums import UserRole
from app.models.user import User
from app.schemas.agent import AgentChatMessage, AgentChatThread
from app.services.agent_ranking import rating_name
from app.services.agents import (
    CURATOR_ROLES,
    leader_ids,
    live_agents_filter,
    active_curator_id,
    get_organization_agent,
    sees_all_agents,
)
from app.services.notifications import notify, preview

HISTORY_LIMIT = 200
AGENT_CHAT_LINK = "/agent/chat"
OFFICE_CHAT_LINK = "/agents/chat"


def _is_agent(user: User) -> bool:
    return user.role == UserRole.AGENT


def _thread_agent(db: Session, user: User, agent_id: UUID | None) -> User:
    if _is_agent(user):
        return user
    if agent_id is None:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Укажите удалённого менеджера")
    return get_organization_agent(db, agent_id=agent_id, user=user)


def _ensure_shared_access(user: User) -> None:
    if not _is_agent(user) and not sees_all_agents(user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Общий чат ведут кураторы")


def _curator_recipients(db: Session, agent: User) -> list[UUID]:
    curator_id = active_curator_id(agent)
    return [curator_id] if curator_id is not None else leader_ids(db, agent.organization_id)


def _to_response(message: AgentMessage, viewer: User) -> AgentChatMessage:
    author = message.author
    from_agent = author is not None and author.role == UserRole.AGENT
    name = author.full_name if author is not None else "Удалённый пользователь"
    if from_agent and _is_agent(viewer) and author.id != viewer.id:
        name = rating_name(name)
    return AgentChatMessage(
        id=message.id,
        author_name=name,
        from_agent=from_agent,
        mine=message.author_id == viewer.id,
        body=message.body,
        created_at=message.created_at,
    )


def _history(db: Session, viewer: User, agent_id: UUID | None) -> list[AgentChatMessage]:
    thread = AgentMessage.agent_id == agent_id if agent_id is not None else AgentMessage.agent_id.is_(None)
    messages = db.scalars(
        select(AgentMessage)
        .options(joinedload(AgentMessage.author))
        .where(AgentMessage.organization_id == viewer.organization_id, thread)
        .order_by(AgentMessage.created_at.desc())
        .limit(HISTORY_LIMIT)
    ).all()
    return [_to_response(message, viewer) for message in reversed(messages)]


def _post(db: Session, author: User, agent_id: UUID | None, body: str) -> AgentChatMessage:
    message = AgentMessage(
        organization_id=author.organization_id, agent_id=agent_id, author_id=author.id, body=body
    )
    db.add(message)
    db.flush()
    db.refresh(message)
    return _to_response(message, author)


def list_personal(db: Session, user: User, agent_id: UUID | None) -> list[AgentChatMessage]:
    agent = _thread_agent(db, user, agent_id)
    return _history(db, user, agent.id)


def send_personal(db: Session, user: User, agent_id: UUID | None, body: str) -> AgentChatMessage:
    agent = _thread_agent(db, user, agent_id)
    response = _post(db, user, agent.id, body)
    if _is_agent(user):
        notify(
            db,
            recipient_ids=_curator_recipients(db, agent),
            organization_id=agent.organization_id,
            kind="agent_chat",
            title=f"{agent.full_name} написал(а) в чат",
            body=preview(body),
            link=f"{OFFICE_CHAT_LINK}?agent={agent.id}",
            actor=user,
        )
    else:
        notify(
            db,
            recipient_ids=[agent.id],
            organization_id=agent.organization_id,
            kind="agent_chat",
            title="Куратор ответил в чате",
            body=preview(body),
            link=AGENT_CHAT_LINK,
            actor=user,
            collapse=True,
        )
    db.commit()
    return response


def list_shared(db: Session, user: User) -> list[AgentChatMessage]:
    _ensure_shared_access(user)
    return _history(db, user, None)


def send_shared(db: Session, user: User, body: str) -> AgentChatMessage:
    _ensure_shared_access(user)
    response = _post(db, user, None, body)
    if _is_agent(user):
        notify(
            db,
            recipient_ids=_curator_recipients(db, user),
            organization_id=user.organization_id,
            kind="agent_chat_shared",
            title=f"Вопрос в общем чате от {user.full_name}",
            body=preview(body),
            link=f"{OFFICE_CHAT_LINK}?tab=shared",
            actor=user,
        )
    else:
        notify(
            db,
            recipient_ids=db.scalars(select(User.id).where(*live_agents_filter(user.organization_id))),
            organization_id=user.organization_id,
            kind="agent_chat_shared",
            title="Новый ответ в общем чате",
            body=preview(body),
            link=f"{AGENT_CHAT_LINK}?tab=shared",
            actor=user,
            collapse=True,
        )
    db.commit()
    return response


def list_threads(db: Session, user: User) -> list[AgentChatThread]:
    if _is_agent(user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Недостаточно прав")
    stmt = (
        select(User)
        .options(joinedload(User.curator))
        .where(
            User.organization_id == user.organization_id,
            User.role == UserRole.AGENT,
            User.deleted_at.is_(None),
        )
    )
    if not sees_all_agents(user):
        stmt = stmt.where(User.curator_id == user.id)
    agents = list(db.scalars(stmt))
    last: dict[UUID, AgentMessage] = {}
    if agents:
        for message in db.scalars(
            select(AgentMessage)
            .options(joinedload(AgentMessage.author))
            .where(AgentMessage.agent_id.in_([agent.id for agent in agents]))
            .order_by(AgentMessage.created_at.desc())
        ):
            last.setdefault(message.agent_id, message)

    threads = [
        AgentChatThread(
            agent_id=agent.id,
            agent_name=agent.full_name,
            curator_name=agent.curator.full_name if agent.curator is not None else None,
            is_active=agent.is_active,
            last_body=last[agent.id].body if agent.id in last else None,
            last_at=last[agent.id].created_at if agent.id in last else None,
            last_from_agent=agent.id in last and last[agent.id].author_id == agent.id,
        )
        for agent in agents
    ]
    # Сначала свежие переписки, затем агенты без сообщений — по алфавиту.
    threads.sort(key=lambda thread: thread.agent_name)
    threads.sort(key=lambda thread: thread.last_at.timestamp() if thread.last_at else 0, reverse=True)
    return threads


def set_whatsapp_group(db: Session, user: User, url: str | None) -> str | None:
    if user.role not in CURATOR_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Группу публикует куратор")
    user.whatsapp_group_url = url
    db.commit()
    return user.whatsapp_group_url
