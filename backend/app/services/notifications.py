"""Колокольчик в приложении.

Сервис только добавляет записи в сессию — коммитит вызывающая операция,
чтобы уведомление не появилось без самого события (и наоборот).
"""

from collections.abc import Iterable
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session, joinedload

from app.models.client_questionnaire import ClientQuestionnaire
from app.models.notification import Notification
from app.models.user import User
from app.schemas.notification import NotificationList, NotificationResponse

LIST_LIMIT = 30
BODY_PREVIEW = 200


def notify(
    db: Session,
    *,
    recipient_ids: Iterable[UUID | None],
    organization_id: UUID,
    kind: str,
    title: str,
    body: str | None = None,
    link: str | None = None,
    questionnaire_id: UUID | None = None,
    actor: User | None = None,
    collapse: bool = False,
) -> None:
    """`collapse` — не плодить одинаковые непрочитанные (серия правок одной анкеты)."""
    seen: set[UUID] = set()
    for recipient_id in recipient_ids:
        if recipient_id is None or recipient_id in seen:
            continue
        seen.add(recipient_id)
        if actor is not None and recipient_id == actor.id:
            continue
        if collapse:
            existing = db.scalar(
                select(Notification).where(
                    Notification.recipient_id == recipient_id,
                    Notification.kind == kind,
                    Notification.questionnaire_id == questionnaire_id,
                    Notification.read_at.is_(None),
                )
            )
            if existing is not None:
                existing.title = title
                existing.body = body
                existing.created_at = datetime.now(timezone.utc)
                continue
        db.add(
            Notification(
                organization_id=organization_id,
                recipient_id=recipient_id,
                actor_id=actor.id if actor is not None else None,
                questionnaire_id=questionnaire_id,
                kind=kind,
                title=title,
                body=body,
                link=link,
            )
        )


def preview(text: str) -> str:
    text = " ".join(text.split())
    return text if len(text) <= BODY_PREVIEW else f"{text[: BODY_PREVIEW - 1]}…"


def lead_title(item: ClientQuestionnaire) -> str:
    return (item.full_name or "").strip() or item.phone


def notify_office_about_agent_lead(
    db: Session,
    item: ClientQuestionnaire,
    *,
    agent: User,
    curator_id: UUID | None,
    kind: str,
    title: str,
    body: str | None = None,
    collapse: bool = False,
) -> None:
    """Куратору агента и менеджеру, за которым закреплён лид."""
    notify(
        db,
        recipient_ids=(curator_id, item.assigned_manager_id),
        organization_id=item.organization_id,
        kind=kind,
        title=title,
        body=body or f"{agent.full_name} · {lead_title(item)}",
        link=f"/questionnaires/{item.id}",
        questionnaire_id=item.id,
        actor=agent,
        collapse=collapse,
    )


def notify_agent_about_lead(
    db: Session,
    item: ClientQuestionnaire,
    *,
    actor: User | None,
    kind: str,
    title: str,
    body: str | None = None,
) -> None:
    if item.source_agent_id is None:
        return
    notify(
        db,
        recipient_ids=(item.source_agent_id,),
        organization_id=item.organization_id,
        kind=kind,
        title=title,
        body=body,
        link=f"/questionnaires/{item.id}",
        questionnaire_id=item.id,
        actor=actor,
    )


def notify_curator_about_new_agent(
    db: Session,
    agent: User,
    *,
    curator_id: UUID | None,
    actor: User | None = None,
) -> None:
    contact = agent.phone or agent.email or ""
    notify(
        db,
        recipient_ids=(curator_id,),
        organization_id=agent.organization_id,
        kind="agent_assigned",
        title="Вам назначен удалённый менеджер",
        body=f"{agent.full_name}{f' · {contact}' if contact else ''}",
        link=f"/agents/{agent.id}",
        actor=actor,
    )


# --- Чтение -------------------------------------------------------------------


def unread_count(db: Session, user: User) -> int:
    return (
        db.scalar(
            select(func.count())
            .select_from(Notification)
            .where(Notification.recipient_id == user.id, Notification.read_at.is_(None))
        )
        or 0
    )


def list_notifications(db: Session, user: User, *, limit: int = LIST_LIMIT) -> NotificationList:
    items = db.scalars(
        select(Notification)
        .options(joinedload(Notification.actor))
        .where(Notification.recipient_id == user.id)
        .order_by(Notification.created_at.desc())
        .limit(limit)
    ).all()
    return NotificationList(
        items=[
            NotificationResponse(
                id=item.id,
                kind=item.kind,
                title=item.title,
                body=item.body,
                link=item.link,
                actor_name=item.actor.full_name if item.actor is not None else None,
                created_at=item.created_at,
                read_at=item.read_at,
            )
            for item in items
        ],
        unread_count=unread_count(db, user),
    )


def mark_read(db: Session, user: User, ids: list[UUID] | None) -> int:
    """Без ids — прочитать все."""
    stmt = update(Notification).where(
        Notification.recipient_id == user.id,
        Notification.read_at.is_(None),
    )
    if ids is not None:
        if not ids:
            return unread_count(db, user)
        stmt = stmt.where(Notification.id.in_(ids))
    db.execute(stmt.values(read_at=datetime.now(timezone.utc)))
    db.commit()
    return unread_count(db, user)
