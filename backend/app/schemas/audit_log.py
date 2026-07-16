from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from app.models.enums import AuditAction


class AuditLogResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    entity_type: str
    entity_id: UUID
    action: AuditAction
    field_name: str | None
    old_value: str | None
    new_value: str | None
    changed_by: UUID
    changed_by_name: str | None = None
    changed_at: datetime
