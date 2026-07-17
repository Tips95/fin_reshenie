import uuid
from datetime import date
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import MagicMock

from app.models.enums import ClientStatus, UserRole
from app.services.dashboard import get_dashboard_summary


ORG_ID = uuid.UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
USER_ID = uuid.UUID("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb")
CLIENT_ID = uuid.UUID("cccccccc-cccc-cccc-cccc-cccccccccccc")


def make_user(role: UserRole = UserRole.OWNER) -> SimpleNamespace:
    return SimpleNamespace(
        id=USER_ID,
        organization_id=ORG_ID,
        role=role,
    )


def make_client(
    *,
    status: ClientStatus = ClientStatus.ACTIVE,
    debt_amount: str = "350000.00",
) -> SimpleNamespace:
    return SimpleNamespace(
        id=CLIENT_ID,
        status=status,
        debt_amount=Decimal(debt_amount),
        is_deleted=False,
        organization_id=ORG_ID,
        assigned_manager_id=USER_ID,
    )


class TestDashboardSummary:
    def test_owner_gets_financial_metrics(self, monkeypatch):
        client = make_client()
        schedule = SimpleNamespace(
            planned_amount=Decimal("10000.00"),
            paid_amount=Decimal("3000.00"),
            due_date=date.today(),
            deferred_until=None,
        )
        payment = SimpleNamespace(
            amount=Decimal("3000.00"),
            is_refund=False,
            is_deleted=False,
            payment_date=date.today(),
        )

        db = MagicMock()
        db.scalars.side_effect = [
            [client],
            [],
            [schedule],
            [payment],
        ]
        monkeypatch.setattr(
            "app.services.dashboard.client_has_overdue_payments",
            lambda *_args, **_kwargs: False,
        )

        summary = get_dashboard_summary(db, make_user())

        assert summary.clients_total == 1
        assert summary.clients_active == 1
        assert summary.expected_this_month == Decimal("7000.00")
        assert summary.collected_this_month == Decimal("3000.00")
        assert summary.total_remainder == Decimal("7000.00")
        assert summary.total_collected == Decimal("3000.00")
        assert summary.active_debt_total == Decimal("350000.00")
        assert summary.monthly_expenses == Decimal("0.00")
        assert summary.net_profit_this_month == Decimal("3000.00")

    def test_manager_gets_counts_without_financial_metrics(self, monkeypatch):
        client = make_client()
        db = MagicMock()
        db.scalars.return_value = [client]
        monkeypatch.setattr(
            "app.services.dashboard.client_has_overdue_payments",
            lambda *_args, **_kwargs: True,
        )

        summary = get_dashboard_summary(db, make_user(UserRole.MANAGER))

        assert summary.clients_total == 1
        assert summary.clients_overdue == 1
        assert summary.expected_this_month == Decimal("0.00")
        assert summary.total_collected == Decimal("0.00")
        assert summary.active_debt_total == Decimal("0.00")

    def test_call_center_gets_limited_summary(self, monkeypatch):
        client = make_client()
        db = MagicMock()
        db.scalars.return_value = [client]
        monkeypatch.setattr(
            "app.services.dashboard.client_has_overdue_payments",
            lambda *_args, **_kwargs: False,
        )

        summary = get_dashboard_summary(db, make_user(UserRole.CALL_CENTER))

        assert summary.clients_total == 1
        assert summary.clients_overdue == 0
        assert summary.expected_this_month == Decimal("0.00")
        assert summary.total_collected == Decimal("0.00")
        assert summary.monthly_expenses == Decimal("0.00")
        assert summary.net_profit_this_month == Decimal("0.00")
