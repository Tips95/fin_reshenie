from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import require_owner_or_manager
from app.core.database import get_db
from app.models.user import User
from app.schemas.funnel import FunnelOverview
from app.services.funnel import get_funnel_overview

router = APIRouter()


@router.get("/overview", response_model=FunnelOverview)
def funnel_overview(
    current_user: User = Depends(require_owner_or_manager),
    db: Session = Depends(get_db),
) -> FunnelOverview:
    return get_funnel_overview(db, current_user)
