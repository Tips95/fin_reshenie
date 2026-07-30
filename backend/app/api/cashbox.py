from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import require_owner
from app.core.database import get_db
from app.models.user import User
from app.schemas.cashbox import CashboxOverview
from app.services.cashbox import get_cashbox_overview

router = APIRouter()


@router.get("", response_model=CashboxOverview)
def cashbox_overview(
    month: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}$"),
    current_user: User = Depends(require_owner),
    db: Session = Depends(get_db),
) -> CashboxOverview:
    return get_cashbox_overview(
        db,
        current_user,
        month=month or date.today().strftime("%Y-%m"),
    )
