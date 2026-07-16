import uuid
from datetime import date
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import MagicMock

from app.models.enums import ClientStatus, UserRole
from app.services.analytics import get_analytics_overview


ORG_ID = uuid.UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
USER_ID = uuid.UUID("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb")
CLIENT_ID = uuid.UUID("cccccccc-cccc-cccc-cccc-cccccccccccc")
PLAN_ID = uuid.UUID("dddddddd-dddd-dddd-dddd-dddddddddddd")


def make_user(role: UserRole = UserRole.OWNER) -> SimpleNamespace:
    return SimpleNamespace(id=USER_ID, organization_id=ORG_ID, role=role)


def make_client() -> SimpleNamespace:
    return SimpleNamespace(
        id=CLIENT_ID,
        full_name="Иванов Иван",
        contract_date=date(2025, 3, 15),
        debt_amount=Decimal("350000.00"),
        status=ClientStatus.ACTIVE,
        is_deleted=False,
        organization_id=ORG_ID,
        assigned_manager_id=USER_ID,
    )


class TestAnalyticsOverview:
    def test_owner_gets_profit_and_trends(self, monkeypatch):
        client = make_client()
        payment = SimpleNamespace(
            client_id=CLIENT_ID,
            amount=Decimal("10000.00"),
            is_refund=False,
            is_deleted=False,
            payment_date=date.today(),
        )
        mandatory = SimpleNamespace(
            client_id=CLIENT_ID,
            planned_amount=Decimal("25000.00"),
            paid_amount=Decimal("5000.00"),
            is_applicable=True,
        )
        plan = SimpleNamespace(
            id=PLAN_ID,
            client_id=CLIENT_ID,
            total_amount=Decimal("400000.00"),
        )
        schedule = SimpleNamespace(
            installment_plan_id=PLAN_ID,
            planned_amount=Decimal("10000.00"),
            paid_amount=Decimal("3000.00"),
            due_date=date.today(),
        )

        db = MagicMock()
        db.scalars.side_effect = [
            [client],
            [payment],
            [mandatory],
            [plan],
            [schedule],
            [],
        ]
        monkeypatch.setattr(
            "app.services.analytics.client_has_overdue_payments",
            lambda *_args, **_kwargs: False,
        )
        monkeypatch.setattr(
            "app.services.analytics._monthly_expenses_total",
            lambda *_args, **_kwargs: Decimal("415000.00"),
        )

        overview = get_analytics_overview(db, make_user(), months=3)

        assert overview.summary.clients_count == 1
        assert overview.summary.collected_total == Decimal("10000.00")
        assert overview.summary.profit_total == Decimal("5000.00")
        assert overview.client_profits[0].schedule_remainder == Decimal("7000.00")
        assert len(overview.trends) == 3
        assert overview.trends[-1].collected == Decimal("10000.00")

    def test_call_center_gets_empty_overview(self):
        db = MagicMock()
        overview = get_analytics_overview(db, make_user(UserRole.CALL_CENTER))

        assert overview.summary.clients_count == 0
        assert overview.trends == []
        assert overview.client_profits == []
