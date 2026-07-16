from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import require_owner, require_owner_or_manager
from app.core.database import get_db
from app.models.user import User
from app.schemas.analytics import AnalyticsOverview
from app.schemas.document_collection import ManagerCommissionsOverview
from app.services.analytics import get_analytics_overview
from app.services.document_collection import get_manager_commissions_overview

router = APIRouter()


@router.get("/overview", response_model=AnalyticsOverview)
def analytics_overview(
    months: int = Query(default=6, ge=1, le=24),
    current_user: User = Depends(require_owner_or_manager),
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
