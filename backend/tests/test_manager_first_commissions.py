import uuid
from datetime import date, datetime, timezone
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import MagicMock

from app.models.client import MANAGER_FIRST_PAYMENT_COMMISSION
from app.models.enums import ClientStatus, EngagementStage, UserRole
from app.services.manager_first_commissions import get_manager_first_commissions_overview

ORG_ID = uuid.UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
OWNER_ID = uuid.UUID("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb")
MANAGER_A_ID = uuid.UUID("11111111-1111-1111-1111-111111111111")
MANAGER_B_ID = uuid.UUID("22222222-2222-2222-2222-222222222222")
CLIENT_A_ID = uuid.UUID("cccccccc-cccc-cccc-cccc-cccccccccccc")
CLIENT_B_ID = uuid.UUID("dddddddd-dddd-dddd-dddd-dddddddddddd")
CLIENT_C_ID = uuid.UUID("eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee")


def make_user() -> SimpleNamespace:
    return SimpleNamespace(id=OWNER_ID, organization_id=ORG_ID, role=UserRole.OWNER)


def make_client(
    *,
    client_id: uuid.UUID,
    full_name: str,
    contract_date: date,
    manager_id: uuid.UUID | None,
    manager_name: str | None,
    collected: bool = False,
    status: ClientStatus = ClientStatus.ACTIVE,
    stage: EngagementStage = EngagementStage.BANKRUPTCY,
) -> SimpleNamespace:
    manager = (
        SimpleNamespace(id=manager_id, full_name=manager_name)
        if manager_id is not None and manager_name is not None
        else None
    )
    return SimpleNamespace(
        id=client_id,
        full_name=full_name,
        contract_date=contract_date,
        assigned_manager_id=manager_id,
        assigned_manager=manager,
        organization_id=ORG_ID,
        is_deleted=False,
        engagement_stage=stage,
        status=status,
        manager_first_commission_collected=collected,
        manager_first_commission_collected_at=(
            datetime(2026, 10, 30, tzinfo=timezone.utc) if collected else None
        ),
    )


class TestManagerFirstCommissionsOverview:
    def test_groups_by_manager_and_sums_to_pay(self):
        client_a = make_client(
            client_id=CLIENT_A_ID,
            full_name="Алексеев А. А.",
            contract_date=date(2026, 10, 5),
            manager_id=MANAGER_A_ID,
            manager_name="Менеджер А",
            collected=False,
        )
        client_b = make_client(
            client_id=CLIENT_B_ID,
            full_name="Борисов Б. Б.",
            contract_date=date(2026, 10, 12),
            manager_id=MANAGER_A_ID,
            manager_name="Менеджер А",
            collected=True,
        )
        client_c = make_client(
            client_id=CLIENT_C_ID,
            full_name="Васильев В. В.",
            contract_date=date(2026, 10, 20),
            manager_id=MANAGER_B_ID,
            manager_name="Менеджер Б",
            collected=False,
        )

        db = MagicMock()
        month_clients = MagicMock()
        month_clients.unique.return_value = [client_a, client_b, client_c]
        outstanding_extra = uuid.uuid4()
        db.scalars.side_effect = [
            month_clients,
            [CLIENT_A_ID, CLIENT_C_ID, outstanding_extra],
        ]

        overview = get_manager_first_commissions_overview(db, make_user(), month="2026-10")

        assert overview.month == "2026-10"
        assert overview.commission_per_client == MANAGER_FIRST_PAYMENT_COMMISSION
        assert overview.clients_count == 3
        assert overview.total_amount == Decimal("30000.00")
        assert overview.to_pay_amount == Decimal("20000.00")
        assert overview.paid_amount == Decimal("10000.00")
        assert overview.outstanding_to_pay_amount == Decimal("30000.00")
        assert len(overview.managers) == 2

        by_name = {row.manager_name: row for row in overview.managers}
        assert by_name["Менеджер А"].clients_count == 2
        assert by_name["Менеджер А"].to_pay_amount == Decimal("10000.00")
        assert by_name["Менеджер А"].paid_amount == Decimal("10000.00")
        assert by_name["Менеджер Б"].to_pay_amount == Decimal("10000.00")

    def test_months_before_october_2026_are_empty(self):
        db = MagicMock()
        overview = get_manager_first_commissions_overview(db, make_user(), month="2026-09")

        assert overview.clients_count == 0
        assert overview.managers == []
        assert overview.outstanding_to_pay_amount == Decimal("0.00")
        db.scalars.assert_not_called()

    def test_empty_month(self):
        month_clients = MagicMock()
        month_clients.unique.return_value = []

        db = MagicMock()
        db.scalars.side_effect = [month_clients, []]

        overview = get_manager_first_commissions_overview(db, make_user(), month="2026-10")

        assert overview.clients_count == 0
        assert overview.total_amount == Decimal("0.00")
        assert overview.to_pay_amount == Decimal("0.00")
        assert overview.managers == []
        assert overview.outstanding_to_pay_amount == Decimal("0.00")
