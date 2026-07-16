from datetime import date, datetime, time, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.api.deps import get_current_active_user, require_owner
from app.core.database import get_db
from app.models.audit_log import AuditLog
from app.models.user import User
from app.schemas.audit_log import AuditLogResponse

router = APIRouter()


def _to_response(entry: AuditLog) -> AuditLogResponse:
    data = AuditLogResponse.model_validate(entry)
    if entry.changed_by_user is not None:
        data.changed_by_name = entry.changed_by_user.full_name
    return data


@router.get("", response_model=list[AuditLogResponse])
def list_audit_logs(
    entity_type: str | None = Query(default=None),
    entity_id: UUID | None = Query(default=None),
    changed_by: UUID | None = Query(default=None),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> list[AuditLogResponse]:
    stmt = (
        select(AuditLog)
        .options(joinedload(AuditLog.changed_by_user))
        .where(AuditLog.organization_id == current_user.organization_id)
        .order_by(AuditLog.changed_at.desc())
        .limit(limit)
    )

    if entity_type:
        stmt = stmt.where(AuditLog.entity_type == entity_type)
    if entity_id:
        stmt = stmt.where(AuditLog.entity_id == entity_id)
    if changed_by:
        stmt = stmt.where(AuditLog.changed_by == changed_by)
    if date_from:
        start = datetime.combine(date_from, time.min, tzinfo=timezone.utc)
        stmt = stmt.where(AuditLog.changed_at >= start)
    if date_to:
        end = datetime.combine(date_to, time.max, tzinfo=timezone.utc)
        stmt = stmt.where(AuditLog.changed_at <= end)

    entries = list(db.scalars(stmt))
    return [_to_response(entry) for entry in entries]


@router.get("/recent", response_model=list[AuditLogResponse])
def list_recent_audit_logs(
    limit: int = Query(default=50, ge=1, le=200),
    current_user: User = Depends(require_owner),
    db: Session = Depends(get_db),
) -> list[AuditLogResponse]:
    stmt = (
        select(AuditLog)
        .options(joinedload(AuditLog.changed_by_user))
        .where(AuditLog.organization_id == current_user.organization_id)
        .order_by(AuditLog.changed_at.desc())
        .limit(limit)
    )
    entries = list(db.scalars(stmt))
    return [_to_response(entry) for entry in entries]
