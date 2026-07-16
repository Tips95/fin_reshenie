from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import get_current_active_user, require_owner_or_manager
from app.core.database import get_db
from app.models.enums import TaskStatus
from app.models.user import User
from app.schemas.funnel import (
    FunnelOverview,
    ManagerTaskCreate,
    ManagerTaskResponse,
    ManagerTaskUpdate,
)
from app.services.funnel import (
    create_manual_task,
    get_funnel_overview,
    list_manager_tasks,
    update_manager_task,
)

router = APIRouter()


@router.get("/overview", response_model=FunnelOverview)
def funnel_overview(
    current_user: User = Depends(require_owner_or_manager),
    db: Session = Depends(get_db),
) -> FunnelOverview:
    return get_funnel_overview(db, current_user)


@router.get("", response_model=list[ManagerTaskResponse])
def get_tasks(
    status_filter: TaskStatus | None = Query(default=TaskStatus.OPEN, alias="status"),
    current_user: User = Depends(require_owner_or_manager),
    db: Session = Depends(get_db),
) -> list[ManagerTaskResponse]:
    return list_manager_tasks(db, current_user, status=status_filter)


@router.post("", response_model=ManagerTaskResponse, status_code=201)
def create_task(
    payload: ManagerTaskCreate,
    current_user: User = Depends(require_owner_or_manager),
    db: Session = Depends(get_db),
) -> ManagerTaskResponse:
    return create_manual_task(
        db,
        current_user,
        client_id=payload.client_id,
        title=payload.title,
        note=payload.note,
        due_date=payload.due_date,
    )


@router.patch("/{task_id}", response_model=ManagerTaskResponse)
def patch_task(
    task_id: UUID,
    payload: ManagerTaskUpdate,
    current_user: User = Depends(require_owner_or_manager),
    db: Session = Depends(get_db),
) -> ManagerTaskResponse:
    return update_manager_task(
        db,
        current_user,
        task_id,
        status=payload.status,
        note=payload.note,
    )
