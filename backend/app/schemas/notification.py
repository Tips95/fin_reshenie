from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class NotificationResponse(BaseModel):
    id: UUID
    kind: str
    title: str
    body: str | None
    link: str | None
    actor_name: str | None
    created_at: datetime
    read_at: datetime | None


class NotificationList(BaseModel):
    items: list[NotificationResponse]
    unread_count: int


class NotificationUnreadCount(BaseModel):
    count: int


class NotificationReadRequest(BaseModel):
    """Без ids — отметить прочитанными все."""

    ids: list[UUID] | None = None
