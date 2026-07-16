from datetime import date
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import ProcedureStage, TaskStatus, TaskType


class FunnelStageItem(BaseModel):
    stage: ProcedureStage
    count: int


class FunnelOverview(BaseModel):
    stages: list[FunnelStageItem]
    total_clients: int


class ManagerTaskResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    client_id: UUID
    assigned_manager_id: UUID | None
    payment_schedule_id: UUID | None
    task_type: TaskType
    status: TaskStatus
    title: str
    note: str | None
    overdue_days: int | None
    due_date: date | None
    completed_at: date | None
    completed_by: UUID | None
    client_name: str | None = None
    client_phone: str | None = None
    manager_name: str | None = None
    schedule_due_date: date | None = None
    remainder_amount: Decimal | None = None
    payment_window_label: str | None = None


class ManagerTaskUpdate(BaseModel):
    status: TaskStatus | None = None
    note: str | None = Field(default=None, max_length=2000)


class ManagerTaskCreate(BaseModel):
    client_id: UUID
    title: str = Field(min_length=1, max_length=255)
    note: str | None = Field(default=None, max_length=2000)
    due_date: date | None = None
