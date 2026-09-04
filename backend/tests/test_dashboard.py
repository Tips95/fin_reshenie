import uuid
from datetime import date
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import MagicMock

from app.models.enums import ClientStatus, EngagementStage, UserRole
from app.services.dashboard import CivilIncomeStats, get_dashboard_summary


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
    contract_date: date | None = None,
    engagement_stage: EngagementStage = EngagementStage.BANKRUPTCY,
) -> SimpleNamespace:
    return SimpleNamespace(
        id=CLIENT_ID,
        status=status,
        debt_amount=Decimal(debt_amount),
        is_deleted=False,
        organization_id=ORG_ID,
        assigned_manager_id=USER_ID,
        contract_date=contract_date or date.today(),
        engagement_stage=engagement_stage,
    )


def patch_civil_income(monkeypatch, stats: CivilIncomeStats | None = None) -> None:
    monkeypatch.setattr(
        "app.services.dashboard.get_civil_income_stats",
        lambda *_args, **_kwargs: stats or CivilIncomeStats(),
    )


def patch_paid_expenses(monkeypatch, paid: Decimal = Decimal("0.00")) -> None:
    monkeypatch.setattr(
        "app.services.dashboard.paid_fixed_expenses_total",
        lambda *_args, **_kwargs: paid,
    )


def patch_cash_balance(monkeypatch, opening: Decimal | None = None) -> None:
    balance = (
        None if opening is None else SimpleNamespace(opening_amount=opening, comment=None)
    )
    monkeypatch.setattr(
        "app.services.dashboard.get_cash_balance",
        lambda *_args, **_kwargs: balance,
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
            [schedule],
            [payment],
        ]
        monkeypatch.setattr(
            "app.services.dashboard.clients_overdue_map",
            lambda *_args, **_kwargs: {},
        )
        monkeypatch.setattr(
            "app.services.dashboard._count_open_tasks",
            lambda *_args, **_kwargs: 0,
        )
        monkeypatch.setattr(
            "app.services.dashboard._build_overdue_clients_preview",
            lambda *_args, **_kwargs: [],
        )
        monkeypatch.setattr(
            "app.services.dashboard.sum_active_contract_totals",
            lambda *_args, **_kwargs: Decimal("145000.00"),
        )
        monkeypatch.setattr(
            "app.services.dashboard.get_mandatory_paid_totals",
            lambda *_args, **_kwargs: __import__(
                "app.services.mandatory_payment_stats",
                fromlist=["MandatoryPaymentTotals"],
            ).MandatoryPaymentTotals(
                deposit=Decimal("0.00"),
                financial_management=Decimal("0.00"),
                court_fee=Decimal("0.00"),
            ),
        )
        monkeypatch.setattr(
            "app.services.dashboard.get_document_collection_paid_totals",
            lambda *_args, **_kwargs: __import__(
                "app.services.document_collection_stats",
                fromlist=["DocumentCollectionTotals"],
            ).DocumentCollectionTotals(
                collection_cash=Decimal("0.00"),
                notary_fee=Decimal("0.00"),
                manager_commission=Decimal("0.00"),
                paid_count=0,
            ),
        )
        monkeypatch.setattr(
            "app.services.dashboard.count_contracts_signed_in_period",
            lambda *_args, **_kwargs: 0,
        )
        monkeypatch.setattr(
            "app.services.dashboard.monthly_expenses_total",
            lambda *_args, **_kwargs: (Decimal("0.00"), Decimal("0.00"), Decimal("0.00")),
        )
        patch_civil_income(monkeypatch)
        patch_paid_expenses(monkeypatch)
        patch_cash_balance(monkeypatch)

        summary = get_dashboard_summary(db, make_user())

        assert summary.clients_total == 1
        assert summary.clients_active == 1
        assert summary.expected_this_month == Decimal("7000.00")
        assert summary.collected_this_month == Decimal("3000.00")
        assert summary.cash_received_this_month == Decimal("3000.00")
        assert summary.total_remainder == Decimal("7000.00")
        assert summary.total_collected == Decimal("3000.00")
        assert summary.active_contract_total == Decimal("145000.00")
        assert summary.monthly_expenses == Decimal("0.00")
        assert summary.mandatory_paid_total.total == Decimal("0.00")
        assert summary.org_profit_total == Decimal("3000.00")
        assert summary.net_profit_this_month == Decimal("3000.00")
        assert summary.civil_income_this_month == Decimal("0.00")
        assert summary.civil_income_total == Decimal("0.00")

    def test_manager_gets_counts_without_financial_metrics(self, monkeypatch):
        client = make_client()
        db = MagicMock()
        db.scalars.return_value = [client]
        monkeypatch.setattr(
            "app.services.dashboard.clients_overdue_map",
            lambda *_args, **_kwargs: {CLIENT_ID: True},
        )
        monkeypatch.setattr(
            "app.services.dashboard._count_open_tasks",
            lambda *_args, **_kwargs: 2,
        )
        monkeypatch.setattr(
            "app.services.dashboard._build_overdue_clients_preview",
            lambda *_args, **_kwargs: [],
        )

        summary = get_dashboard_summary(db, make_user(UserRole.MANAGER))

        assert summary.clients_total == 1
        assert summary.clients_overdue == 1
        assert summary.open_tasks_count == 2
        assert summary.expected_this_month == Decimal("0.00")
        assert summary.total_collected == Decimal("0.00")
        assert summary.active_contract_total == Decimal("0.00")

    def test_selected_month_shifts_the_reporting_period(self, monkeypatch):
        in_period = make_client(contract_date=date(2026, 5, 14))
        db = MagicMock()
        db.scalars.return_value = [in_period]
        monkeypatch.setattr(
            "app.services.dashboard.clients_overdue_map",
            lambda *_args, **_kwargs: {},
        )
        monkeypatch.setattr(
            "app.services.dashboard._count_open_tasks",
            lambda *_args, **_kwargs: 0,
        )
        monkeypatch.setattr(
            "app.services.dashboard._build_overdue_clients_preview",
            lambda *_args, **_kwargs: [],
        )

        summary = get_dashboard_summary(
            db,
            make_user(UserRole.MANAGER),
            month="2026-05",
        )

        assert summary.period_month == "2026-05"
        assert summary.is_current_month is False
        assert summary.clients_new_this_month == 1

    def test_client_from_another_month_is_not_counted_as_new(self, monkeypatch):
        out_of_period = make_client(contract_date=date(2026, 5, 14))
        db = MagicMock()
        db.scalars.return_value = [out_of_period]
        monkeypatch.setattr(
            "app.services.dashboard.clients_overdue_map",
            lambda *_args, **_kwargs: {},
        )
        monkeypatch.setattr(
            "app.services.dashboard._count_open_tasks",
            lambda *_args, **_kwargs: 0,
        )
        monkeypatch.setattr(
            "app.services.dashboard._build_overdue_clients_preview",
            lambda *_args, **_kwargs: [],
        )

        summary = get_dashboard_summary(
            db,
            make_user(UserRole.MANAGER),
            month="2026-06",
        )

        assert summary.clients_new_this_month == 0

    def test_clients_on_document_collection_are_counted(self, monkeypatch):
        client = make_client(engagement_stage=EngagementStage.DOCUMENT_COLLECTION)
        db = MagicMock()
        db.scalars.return_value = [client]
        monkeypatch.setattr(
            "app.services.dashboard.clients_overdue_map",
            lambda *_args, **_kwargs: {},
        )
        monkeypatch.setattr(
            "app.services.dashboard._count_open_tasks",
            lambda *_args, **_kwargs: 0,
        )
        monkeypatch.setattr(
            "app.services.dashboard._build_overdue_clients_preview",
            lambda *_args, **_kwargs: [],
        )

        summary = get_dashboard_summary(db, make_user(UserRole.MANAGER))

        assert summary.collection_in_progress == 1
        assert summary.is_current_month is True

    def test_document_collection_included_in_cash_received_this_month(self, monkeypatch):
        client = make_client(engagement_stage=EngagementStage.DOCUMENT_COLLECTION)
        db = MagicMock()
        db.scalars.side_effect = [
            [client],
            [],
            [],
            [],
        ]
        monkeypatch.setattr(
            "app.services.dashboard.clients_overdue_map",
            lambda *_args, **_kwargs: {},
        )
        monkeypatch.setattr(
            "app.services.dashboard._count_open_tasks",
            lambda *_args, **_kwargs: 0,
        )
        monkeypatch.setattr(
            "app.services.dashboard._build_overdue_clients_preview",
            lambda *_args, **_kwargs: [],
        )
        monkeypatch.setattr(
            "app.services.dashboard.sum_active_contract_totals",
            lambda *_args, **_kwargs: Decimal("0.00"),
        )
        monkeypatch.setattr(
            "app.services.dashboard.get_mandatory_paid_totals",
            lambda *_args, **_kwargs: __import__(
                "app.services.mandatory_payment_stats",
                fromlist=["MandatoryPaymentTotals"],
            ).MandatoryPaymentTotals(
                deposit=Decimal("0.00"),
                financial_management=Decimal("0.00"),
                court_fee=Decimal("0.00"),
            ),
        )

        def fake_collection_totals(_db, _client_ids, *, date_from=None, date_to=None):
            if date_from is not None and date_to is not None:
                return __import__(
                    "app.services.document_collection_stats",
                    fromlist=["DocumentCollectionTotals"],
                ).DocumentCollectionTotals(
                    collection_cash=Decimal("10000.00"),
                    notary_fee=Decimal("2000.00"),
                    manager_commission=Decimal("1000.00"),
                    paid_count=1,
                )
            return __import__(
                "app.services.document_collection_stats",
                fromlist=["DocumentCollectionTotals"],
            ).DocumentCollectionTotals(
                collection_cash=Decimal("10000.00"),
                notary_fee=Decimal("2000.00"),
                manager_commission=Decimal("1000.00"),
                paid_count=1,
            )

        monkeypatch.setattr(
            "app.services.dashboard.get_document_collection_paid_totals",
            fake_collection_totals,
        )
        monkeypatch.setattr(
            "app.services.dashboard.count_contracts_signed_in_period",
            lambda *_args, **_kwargs: 0,
        )
        monkeypatch.setattr(
            "app.services.dashboard.monthly_expenses_total",
            lambda *_args, **_kwargs: (Decimal("0.00"), Decimal("0.00"), Decimal("0.00")),
        )
        patch_civil_income(
            monkeypatch,
            CivilIncomeStats(
                cases_total=3,
                cases_this_month=1,
                income_total=Decimal("45000.00"),
                income_this_month=Decimal("12000.00"),
            ),
        )
        patch_paid_expenses(monkeypatch)
        patch_cash_balance(monkeypatch)

        summary = get_dashboard_summary(db, make_user())

        assert summary.collected_this_month == Decimal("0.00")
        assert summary.cash_received_this_month == Decimal("10000.00")
        assert summary.document_collection_this_month.collection_cash == Decimal("10000.00")
        assert summary.net_profit_this_month == Decimal("10000.00")
        assert summary.org_profit_total == Decimal("10000.00")
        assert summary.civil_income_this_month == Decimal("12000.00")
        assert summary.civil_income_total == Decimal("45000.00")
        assert summary.civil_cases_this_month == 1
        assert summary.civil_cases_total == 3

    def test_cash_on_hand_counts_paid_expenses_not_budget(self, monkeypatch):
        client = make_client()
        payment = SimpleNamespace(
            amount=Decimal("3000.00"),
            is_refund=False,
            is_deleted=False,
            payment_date=date.today(),
        )
        db = MagicMock()
        db.scalars.side_effect = [[client], [], [payment]]
        monkeypatch.setattr(
            "app.services.dashboard.clients_overdue_map",
            lambda *_args, **_kwargs: {},
        )
        monkeypatch.setattr(
            "app.services.dashboard._count_open_tasks",
            lambda *_args, **_kwargs: 0,
        )
        monkeypatch.setattr(
            "app.services.dashboard._build_overdue_clients_preview",
            lambda *_args, **_kwargs: [],
        )
        monkeypatch.setattr(
            "app.services.dashboard.sum_active_contract_totals",
            lambda *_args, **_kwargs: Decimal("0.00"),
        )
        monkeypatch.setattr(
            "app.services.dashboard.get_mandatory_paid_totals",
            lambda *_args, **_kwargs: __import__(
                "app.services.mandatory_payment_stats",
                fromlist=["MandatoryPaymentTotals"],
            ).MandatoryPaymentTotals(
                deposit=Decimal("0.00"),
                financial_management=Decimal("0.00"),
                court_fee=Decimal("0.00"),
            ),
        )
        monkeypatch.setattr(
            "app.services.dashboard.get_document_collection_paid_totals",
            lambda *_args, **_kwargs: __import__(
                "app.services.document_collection_stats",
                fromlist=["DocumentCollectionTotals"],
            ).DocumentCollectionTotals(
                collection_cash=Decimal("0.00"),
                notary_fee=Decimal("0.00"),
                manager_commission=Decimal("0.00"),
                paid_count=0,
            ),
        )
        monkeypatch.setattr(
            "app.services.dashboard.count_contracts_signed_in_period",
            lambda *_args, **_kwargs: 0,
        )
        monkeypatch.setattr(
            "app.services.dashboard.monthly_expenses_total",
            lambda *_args, **_kwargs: (Decimal("1000.00"), Decimal("1000.00"), Decimal("0.00")),
        )
        patch_civil_income(
            monkeypatch,
            CivilIncomeStats(
                cases_total=1,
                cases_this_month=1,
                income_total=Decimal("5000.00"),
                income_this_month=Decimal("5000.00"),
            ),
        )
        patch_paid_expenses(monkeypatch, Decimal("400.00"))
        patch_cash_balance(monkeypatch, Decimal("500000.00"))

        summary = get_dashboard_summary(db, make_user())

        assert summary.net_profit_this_month == Decimal("2000.00")
        assert summary.cash_opening_balance == Decimal("500000.00")
        assert summary.cash_opening_is_set is True
        # Гражданка попадает в кассу, но не в прибыль по банкротству.
        assert summary.cash_in_this_month == Decimal("8000.00")
        # Из бюджета в 1000 закрыто только 400 — остальное ещё предстоит потратить.
        assert summary.expenses_paid_this_month == Decimal("400.00")
        assert summary.expenses_remaining_this_month == Decimal("600.00")
        assert summary.cash_on_hand == Decimal("507600.00")
        assert summary.cash_forecast_end == (
            summary.cash_on_hand + summary.expected_this_month - Decimal("600.00")
        )

    def test_call_center_gets_limited_summary(self, monkeypatch):
        client = make_client()
        db = MagicMock()
        db.scalars.return_value = [client]
        monkeypatch.setattr(
            "app.services.dashboard.clients_overdue_map",
            lambda *_args, **_kwargs: {},
        )
        monkeypatch.setattr(
            "app.services.dashboard._count_open_tasks",
            lambda *_args, **_kwargs: 0,
        )
        monkeypatch.setattr(
            "app.services.dashboard._build_overdue_clients_preview",
            lambda *_args, **_kwargs: [],
        )

        summary = get_dashboard_summary(db, make_user(UserRole.CALL_CENTER))

        assert summary.clients_total == 1
        assert summary.clients_overdue == 0
        assert summary.expected_this_month == Decimal("0.00")
        assert summary.total_collected == Decimal("0.00")
        assert summary.monthly_expenses == Decimal("0.00")
        assert summary.net_profit_this_month == Decimal("0.00")
