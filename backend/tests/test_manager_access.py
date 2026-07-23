import uuid
from decimal import Decimal
from types import SimpleNamespace

from app.models.enums import EngagementStage, UserRole
from app.services.access import manager_can_access_client


ORG_ID = uuid.UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
MANAGER_ID = uuid.UUID("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb")
OTHER_MANAGER_ID = uuid.UUID("cccccccc-cccc-cccc-cccc-cccccccccccc")


def make_manager() -> SimpleNamespace:
    return SimpleNamespace(id=MANAGER_ID, organization_id=ORG_ID, role=UserRole.MANAGER)


def make_client(
    *,
    assigned_manager_id=None,
    engagement_stage=EngagementStage.DOCUMENT_COLLECTION,
) -> SimpleNamespace:
    return SimpleNamespace(
        assigned_manager_id=assigned_manager_id,
        engagement_stage=engagement_stage,
        debt_amount=Decimal("0.00"),
    )


class TestManagerClientAccess:
    def test_assigned_client_accessible(self):
        client = make_client(assigned_manager_id=MANAGER_ID)
        assert manager_can_access_client(client, make_manager()) is True

    def test_unassigned_collection_client_accessible(self):
        client = make_client(assigned_manager_id=None)
        assert manager_can_access_client(client, make_manager()) is True

    def test_unassigned_bankruptcy_client_not_accessible(self):
        client = make_client(
            assigned_manager_id=None,
            engagement_stage=EngagementStage.BANKRUPTCY,
        )
        assert manager_can_access_client(client, make_manager()) is False

    def test_other_manager_client_not_accessible(self):
        client = make_client(assigned_manager_id=OTHER_MANAGER_ID)
        assert manager_can_access_client(client, make_manager()) is False
