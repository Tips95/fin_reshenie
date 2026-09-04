from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import get_current_active_user, require_owner
from app.core.database import get_db
from app.models.enums import AuditAction
from app.models.user import User
from app.schemas.dashboard import (
    CashBalanceCarryForward,
    CashBalanceResponse,
    CashBalanceUpdate,
    DashboardSummary,
)
from app.services.audit import log_audit
from app.services.cash_balance import get_cash_balance, next_month_key, set_cash_balance
from app.services.dashboard import get_dashboard_summary

router = APIRouter()


@router.get("/summary", response_model=DashboardSummary)
def dashboard_summary(
    month: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}$"),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> DashboardSummary:
    return get_dashboard_summary(db, current_user, month=month)


def _save_balance(
    db: Session,
    current_user: User,
    *,
    month: str,
    opening_amount,
    comment: str | None,
) -> CashBalanceResponse:
    existing = get_cash_balance(db, current_user.organization_id, month)
    old_amount = existing.opening_amount if existing is not None else None

    balance = set_cash_balance(
        db,
        current_user.organization_id,
        month,
        opening_amount=opening_amount,
        comment=comment,
        updated_by=current_user.id,
    )

    if old_amount != balance.opening_amount:
        log_audit(
            db,
            user=current_user,
            entity_type="cash_balance",
            entity_id=balance.id,
            action=AuditAction.CREATE if existing is None else AuditAction.UPDATE,
            field_name="opening_amount",
            old_value=old_amount,
            new_value=balance.opening_amount,
        )
    db.commit()
    db.refresh(balance)
    return CashBalanceResponse(
        month=month,
        opening_amount=balance.opening_amount,
        comment=balance.comment,
    )


@router.put("/cash-balance", response_model=CashBalanceResponse)
def update_cash_balance(
    payload: CashBalanceUpdate,
    current_user: User = Depends(require_owner),
    db: Session = Depends(get_db),
) -> CashBalanceResponse:
    return _save_balance(
        db,
        current_user,
        month=payload.month,
        opening_amount=payload.opening_amount,
        comment=payload.comment,
    )


@router.post("/cash-balance/carry-forward", response_model=CashBalanceResponse)
def carry_forward_cash_balance(
    payload: CashBalanceCarryForward,
    current_user: User = Depends(require_owner),
    db: Session = Depends(get_db),
) -> CashBalanceResponse:
    """Остаток на конец месяца становится остатком на начало следующего."""
    summary = get_dashboard_summary(db, current_user, month=payload.month)
    target_month = next_month_key(payload.month)

    return _save_balance(
        db,
        current_user,
        month=target_month,
        opening_amount=summary.cash_on_hand,
        comment=f"Перенос остатка за {payload.month}",
    )
