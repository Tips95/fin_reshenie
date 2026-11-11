from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import require_any_authenticated
from app.core.database import get_db
from app.models.user import User
from app.schemas.notification import (
    NotificationList,
    NotificationReadRequest,
    NotificationUnreadCount,
)
from app.services.notifications import LIST_LIMIT, list_notifications, mark_read, unread_count

router = APIRouter()


@router.get("", response_model=NotificationList)
def get_notifications(
    limit: int = Query(LIST_LIMIT, ge=1, le=100),
    current_user: User = Depends(require_any_authenticated),
    db: Session = Depends(get_db),
) -> NotificationList:
    return list_notifications(db, current_user, limit=limit)


@router.get("/unread-count", response_model=NotificationUnreadCount)
def get_unread_count(
    current_user: User = Depends(require_any_authenticated),
    db: Session = Depends(get_db),
) -> NotificationUnreadCount:
    return NotificationUnreadCount(count=unread_count(db, current_user))


@router.post("/read", response_model=NotificationUnreadCount)
def post_read(
    payload: NotificationReadRequest,
    current_user: User = Depends(require_any_authenticated),
    db: Session = Depends(get_db),
) -> NotificationUnreadCount:
    return NotificationUnreadCount(count=mark_read(db, current_user, payload.ids))
