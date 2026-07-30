import uuid
from datetime import date, timedelta
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import MagicMock

from app.models.enums import (
    DocumentCollectionStatus,
    EngagementStage,
    MandatoryPaymentType,
    PaymentScheduleStatus,
    UserRole,
)
from app.services.cashbox import get_cashbox_overview


ORG_ID = uuid.UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
OWNER_ID = uuid.UUID("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb")
CLIENT_ID = uuid.UUID("cccccccc-cccc-cccc-cccc-cccccccccccc")
SCHEDULE_ID = uuid.UUID("dddddddd-dddd-dddd-dddd-dddddddddddd")
MANDATORY_ID = uuid.UUID("eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee")

TODAY = date(2026, 7, 20)
MONTH = "2026-07"


def make_owner() -> SimpleNamespace:
    return SimpleNamespace(id=OWNER_ID, organization_id=ORG_ID, role=UserRole.OWNER)


def make_client(
    *,
    engagement_stage: EngagementStage = EngagementStage.BANKRUPTCY,
    contract_date: date = date(2026, 1, 15),
) -> SimpleNamespace:
    return SimpleNamespace(
        id=CLIENT_ID,
        full_name="Иванов Иван Иванович",
        phone="+79990000000",
        contract_date=contract_date,
        engagement_stage=engagement_stage,
        assigned_manager_id=None,
        is_deleted=False,
        organization_id=ORG_ID,
    )


def make_schedule(
    *,
    due_date: date,
    planned: str = "10000.00",
    paid: str = "0.00",
    deferred_until: date | None = None,
) -> SimpleNamespace:
    return SimpleNamespace(
        id=SCHEDULE_ID,
        month_number=3,
        planned_amount=Decimal(planned),
        paid_amount=Decimal(paid),
        due_date=due_date,
        deferred_until=deferred_until,
        status=PaymentScheduleStatus.PENDING,
        overdue_waived=False,
    )


def build_db(
    *,
    clients: list,
    schedules: list,
    collections: list | None = None,
    mandatory: list | None = None,
    payments: list | None = None,
) -> MagicMock:
    db = MagicMock()
    db.execute.side_effect = [
        [(OWNER_ID, "Руководитель")],
        [(CLIENT_ID, schedule) for schedule in schedules],
    ]
    db.scalars.side_effect = [
        clients,
        collections or [],
        mandatory or [],
        payments or [],
    ]
    return db


class TestCashboxSchedule:
    def test_unpaid_schedule_of_month_lands_in_queue(self):
        db = build_db(
            clients=[make_client()],
            schedules=[make_schedule(due_date=date(2026, 7, 10))],
        )

        overview = get_cashbox_overview(db, make_owner(), month=MONTH, today=TODAY)

        assert overview.schedule_totals.count == 1
        assert overview.schedule_totals.amount == Decimal("10000.00")
        assert overview.schedule_items[0].remainder == Decimal("10000.00")
        assert overview.schedule_items[0].is_overdue is False

    def test_future_month_schedule_is_excluded(self):
        db = build_db(
            clients=[make_client()],
            schedules=[make_schedule(due_date=date(2026, 9, 10))],
        )

        overview = get_cashbox_overview(db, make_owner(), month=MONTH, today=TODAY)

        assert overview.schedule_totals.count == 0

    def test_fully_paid_schedule_is_excluded(self):
        db = build_db(
            clients=[make_client()],
            schedules=[make_schedule(due_date=date(2026, 7, 10), paid="10000.00")],
        )

        overview = get_cashbox_overview(db, make_owner(), month=MONTH, today=TODAY)

        assert overview.schedule_totals.count == 0

    def test_partial_payment_leaves_only_remainder(self):
        db = build_db(
            clients=[make_client()],
            schedules=[make_schedule(due_date=date(2026, 7, 10), paid="4000.00")],
        )

        overview = get_cashbox_overview(db, make_owner(), month=MONTH, today=TODAY)

        assert overview.schedule_items[0].remainder == Decimal("6000.00")

    def test_debt_from_earlier_months_stays_visible(self):
        db = build_db(
            clients=[make_client()],
            schedules=[make_schedule(due_date=date(2026, 4, 10))],
        )

        overview = get_cashbox_overview(db, make_owner(), month=MONTH, today=TODAY)

        assert overview.schedule_totals.count == 1
        assert overview.schedule_items[0].is_overdue is True
        assert overview.overdue_count == 1

    def test_deferral_moves_payment_to_its_new_month(self):
        db = build_db(
            clients=[make_client()],
            schedules=[
                make_schedule(due_date=date(2026, 7, 10), deferred_until=date(2026, 10, 10))
            ],
        )

        overview = get_cashbox_overview(db, make_owner(), month=MONTH, today=TODAY)

        assert overview.schedule_totals.count == 0


class TestCashboxCollectionAndMandatory:
    def test_pending_collection_is_listed_with_waiting_days(self):
        client = make_client(
            engagement_stage=EngagementStage.DOCUMENT_COLLECTION,
            contract_date=TODAY - timedelta(days=12),
        )
        collection = SimpleNamespace(
            client_id=CLIENT_ID,
            status=DocumentCollectionStatus.PENDING,
            total_amount=Decimal("13000.00"),
            collection_fee=Decimal("10000.00"),
            notary_fee=Decimal("2000.00"),
            manager_commission=Decimal("1000.00"),
        )
        db = build_db(clients=[client], schedules=[], collections=[collection])

        overview = get_cashbox_overview(db, make_owner(), month=MONTH, today=TODAY)

        assert overview.collection_totals.count == 1
        assert overview.collection_totals.amount == Decimal("13000.00")
        assert overview.collection_items[0].waiting_days == 12

    def test_mandatory_payment_without_planned_amount_is_skipped(self):
        unplanned = SimpleNamespace(
            id=MANDATORY_ID,
            client_id=CLIENT_ID,
            payment_type=MandatoryPaymentType.COURT_FEE,
            planned_amount=Decimal("0.00"),
            paid_amount=Decimal("0.00"),
            is_applicable=True,
        )
        db = build_db(clients=[make_client()], schedules=[], mandatory=[unplanned])

        overview = get_cashbox_overview(db, make_owner(), month=MONTH, today=TODAY)

        assert overview.mandatory_totals.count == 0

    def test_mandatory_remainder_is_expected(self):
        deposit = SimpleNamespace(
            id=MANDATORY_ID,
            client_id=CLIENT_ID,
            payment_type=MandatoryPaymentType.DEPOSIT,
            planned_amount=Decimal("25000.00"),
            paid_amount=Decimal("10000.00"),
            is_applicable=True,
        )
        db = build_db(clients=[make_client()], schedules=[], mandatory=[deposit])

        overview = get_cashbox_overview(db, make_owner(), month=MONTH, today=TODAY)

        assert overview.mandatory_totals.amount == Decimal("15000.00")
        assert overview.expected_total == Decimal("15000.00")


class TestCashboxCollected:
    def test_refund_reduces_collected_amount(self):
        payments = [
            SimpleNamespace(amount=Decimal("10000.00"), is_refund=False),
            SimpleNamespace(amount=Decimal("2500.00"), is_refund=True),
        ]
        db = build_db(clients=[make_client()], schedules=[], payments=payments)

        overview = get_cashbox_overview(db, make_owner(), month=MONTH, today=TODAY)

        assert overview.collected_in_month == Decimal("7500.00")
        assert overview.month == MONTH
