from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import get_current_active_user
from app.core.database import get_db
from app.models.user import User
from app.schemas.dashboard import DashboardSummary
from app.services.dashboard import get_dashboard_summary

router = APIRouter()


@router.get("/summary", response_model=DashboardSummary)
def dashboard_summary(
    month: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}$"),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> DashboardSummary:
    return get_dashboard_summary(db, current_user, month=month)
