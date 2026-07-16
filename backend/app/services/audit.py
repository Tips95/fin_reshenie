from decimal import Decimal
from typing import Any
from uuid import UUID

from sqlalchemy.orm import Session

from app.models.audit_log import AuditLog
from app.models.enums import AuditAction
from app.models.user import User


def _serialize(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, Decimal):
        return str(value)
    return str(value)


def log_audit(
    db: Session,
    *,
    user: User,
    entity_type: str,
    entity_id: UUID,
    action: AuditAction,
    field_name: str | None = None,
    old_value: Any = None,
    new_value: Any = None,
) -> None:
    db.add(
        AuditLog(
            organization_id=user.organization_id,
            entity_type=entity_type,
            entity_id=entity_id,
            action=action,
            field_name=field_name,
            old_value=_serialize(old_value),
            new_value=_serialize(new_value),
            changed_by=user.id,
        )
    )
