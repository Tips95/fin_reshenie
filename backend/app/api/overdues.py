from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import require_overdue_staff
from app.core.database import get_db
from app.models.user import User
from app.schemas.overdue import OverdueQueueResponse
from app.services.overdues import list_overdue_queue, sync_promised_pay_notifications

router = APIRouter()


@router.get("", response_model=OverdueQueueResponse)
def get_overdues(
    current_user: User = Depends(require_overdue_staff),
    db: Session = Depends(get_db),
) -> OverdueQueueResponse:
    sync_promised_pay_notifications(db, organization_id=current_user.organization_id)
    return list_overdue_queue(db, current_user)
