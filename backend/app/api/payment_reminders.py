from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import require_payment_reminder_staff
from app.core.database import get_db
from app.models.user import User
from app.schemas.payment_reminders import (
    PaymentRemindersPreview,
    PaymentRemindersSendRequest,
    PaymentRemindersSendResponse,
)
from app.services.payment_reminders import preview_payment_reminders, send_payment_reminders

router = APIRouter()


@router.get("", response_model=PaymentRemindersPreview)
def get_payment_reminders(
    month: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}$"),
    current_user: User = Depends(require_payment_reminder_staff),
    db: Session = Depends(get_db),
) -> PaymentRemindersPreview:
    return preview_payment_reminders(db, current_user, month=month)


@router.post("/send", response_model=PaymentRemindersSendResponse)
def post_payment_reminders_send(
    body: PaymentRemindersSendRequest,
    current_user: User = Depends(require_payment_reminder_staff),
    db: Session = Depends(get_db),
) -> PaymentRemindersSendResponse:
    return send_payment_reminders(
        db,
        current_user,
        month=body.month,
        client_ids=body.client_ids,
    )
