from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import require_owner
from app.core.database import get_db
from app.models.user import User
from app.schemas.analytics import AnalyticsOverview
from app.schemas.document_collection import ManagerCommissionsOverview
from app.schemas.manager_first_commissions import ManagerFirstCommissionsOverview
from app.services.analytics import get_analytics_overview
from app.services.document_collection import get_manager_commissions_overview
from app.services.manager_first_commissions import get_manager_first_commissions_overview

router = APIRouter()


@router.get("/overview", response_model=AnalyticsOverview)
def analytics_overview(
    months: int = Query(default=6, ge=1, le=24),
    current_user: User = Depends(require_owner),
    db: Session = Depends(get_db),
) -> AnalyticsOverview:
    return get_analytics_overview(db, current_user, months=months)


@router.get("/manager-commissions", response_model=ManagerCommissionsOverview)
def manager_commissions(
    months: int = Query(default=6, ge=1, le=24),
    current_user: User = Depends(require_owner),
    db: Session = Depends(get_db),
) -> ManagerCommissionsOverview:
    return get_manager_commissions_overview(db, current_user, months=months)


@router.get("/manager-first-commissions", response_model=ManagerFirstCommissionsOverview)
def manager_first_commissions(
    month: str = Query(..., pattern=r"^\d{4}-\d{2}$"),
    current_user: User = Depends(require_owner),
    db: Session = Depends(get_db),
) -> ManagerFirstCommissionsOverview:
    """10 000 ₽ менеджеру за каждого клиента, переведённого на банкротство в месяце."""
    return get_manager_first_commissions_overview(db, current_user, month=month)
