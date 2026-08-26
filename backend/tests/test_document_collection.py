import uuid
from datetime import date
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import MagicMock

from app.models.enums import DocumentCollectionStatus, EngagementStage, ProcedureStage, UserRole
from app.services.document_collection import (
    convert_client_to_bankruptcy,
    create_document_collection,
    record_document_collection_payment,
    unrecord_document_collection_payment,
    update_document_collection_amounts,
)


ORG_ID = uuid.UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
USER_ID = uuid.UUID("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb")
CLIENT_ID = uuid.UUID("cccccccc-cccc-cccc-cccc-cccccccccccc")


def make_user(role: UserRole = UserRole.OWNER) -> SimpleNamespace:
    return SimpleNamespace(id=USER_ID, organization_id=ORG_ID, role=role)


def make_client(
    engagement_stage: EngagementStage = EngagementStage.DOCUMENT_COLLECTION,
) -> SimpleNamespace:
    return SimpleNamespace(
        id=CLIENT_ID,
        organization_id=ORG_ID,
        assigned_manager_id=USER_ID,
        full_name="Иванов Иван",
        phone="+7 928 000-00-00",
        contract_date=date(2026, 7, 1),
        debt_amount=Decimal("0.00"),
        engagement_stage=engagement_stage,
        procedure_stage=ProcedureStage.CONTRACT_SIGNED,
    )


class TestDocumentCollection:
    def test_creates_pending_collection(self):
        db = MagicMock()
        item = create_document_collection(db, CLIENT_ID)
        db.add.assert_called_once()
        assert item.total_amount == Decimal("13000.00")
        assert item.manager_commission == Decimal("1000.00")
        assert item.status == DocumentCollectionStatus.PENDING

    def test_records_single_payment(self):
        client = make_client()
        db = MagicMock()
        db.scalar.return_value = SimpleNamespace(
            client_id=CLIENT_ID,
            status=DocumentCollectionStatus.PENDING,
            paid_date=None,
        )

        item = record_document_collection_payment(db, client, payment_date=date(2026, 7, 10))

        assert item.status == DocumentCollectionStatus.PAID
        assert item.paid_date == date(2026, 7, 10)

    def test_updates_pending_collection_amounts(self):
        client = make_client()
        db = MagicMock()
        item = SimpleNamespace(
            client_id=CLIENT_ID,
            status=DocumentCollectionStatus.PENDING,
            collection_fee=Decimal("10000.00"),
            notary_fee=Decimal("2000.00"),
            manager_commission=Decimal("1000.00"),
            total_amount=Decimal("13000.00"),
        )
        db.scalar.return_value = item

        updated = update_document_collection_amounts(
            db,
            client,
            collection_fee=Decimal("12000.00"),
            notary_fee=Decimal("2500.00"),
            manager_commission=Decimal("1500.00"),
        )

        assert updated.collection_fee == Decimal("12000.00")
        assert updated.notary_fee == Decimal("2500.00")
        assert updated.manager_commission == Decimal("1500.00")
        assert updated.total_amount == Decimal("16000.00")

    def test_owner_can_correct_paid_collection_to_ten_thousand(self):
        client = make_client()
        db = MagicMock()
        item = SimpleNamespace(
            client_id=CLIENT_ID,
            status=DocumentCollectionStatus.PAID,
            paid_date=date(2026, 7, 10),
            collection_fee=Decimal("10000.00"),
            notary_fee=Decimal("2000.00"),
            manager_commission=Decimal("1000.00"),
            total_amount=Decimal("13000.00"),
        )
        db.scalar.return_value = item

        updated = update_document_collection_amounts(
            db,
            client,
            collection_fee=Decimal("10000.00"),
            notary_fee=Decimal("0.00"),
            manager_commission=Decimal("0.00"),
            actor_role=UserRole.OWNER,
            paid_date=date(2026, 7, 8),
        )

        assert updated.total_amount == Decimal("10000.00")
        assert updated.notary_fee == Decimal("0.00")
        assert updated.manager_commission == Decimal("0.00")
        assert updated.status == DocumentCollectionStatus.PAID
        assert updated.paid_date == date(2026, 7, 8)

    def test_manager_can_correct_paid_collection_before_bankruptcy(self):
        client = make_client()
        db = MagicMock()
        item = SimpleNamespace(
            client_id=CLIENT_ID,
            status=DocumentCollectionStatus.PAID,
            paid_date=date(2026, 7, 10),
            collection_fee=Decimal("10000.00"),
            notary_fee=Decimal("2000.00"),
            manager_commission=Decimal("1000.00"),
            total_amount=Decimal("13000.00"),
        )
        db.scalar.return_value = item

        updated = update_document_collection_amounts(
            db,
            client,
            collection_fee=Decimal("10000.00"),
            notary_fee=Decimal("0.00"),
            manager_commission=Decimal("0.00"),
            actor_role=UserRole.MANAGER,
        )

        assert updated.total_amount == Decimal("10000.00")

    def test_manager_cannot_update_collection_after_bankruptcy(self):
        client = make_client(EngagementStage.BANKRUPTCY)
        db = MagicMock()
        db.scalar.return_value = SimpleNamespace(
            client_id=CLIENT_ID,
            status=DocumentCollectionStatus.PAID,
            collection_fee=Decimal("10000.00"),
            notary_fee=Decimal("2000.00"),
            manager_commission=Decimal("1000.00"),
            total_amount=Decimal("13000.00"),
        )

        try:
            update_document_collection_amounts(
                db,
                client,
                collection_fee=Decimal("10000.00"),
                notary_fee=Decimal("0.00"),
                manager_commission=Decimal("0.00"),
                actor_role=UserRole.MANAGER,
            )
            assert False, "expected HTTPException"
        except Exception as exc:
            assert exc.status_code == 422

    def test_owner_can_update_collection_after_bankruptcy(self):
        client = make_client(EngagementStage.BANKRUPTCY)
        db = MagicMock()
        item = SimpleNamespace(
            client_id=CLIENT_ID,
            status=DocumentCollectionStatus.PAID,
            paid_date=date(2026, 7, 10),
            collection_fee=Decimal("10000.00"),
            notary_fee=Decimal("2000.00"),
            manager_commission=Decimal("1000.00"),
            total_amount=Decimal("13000.00"),
        )
        db.scalar.return_value = item

        updated = update_document_collection_amounts(
            db,
            client,
            collection_fee=Decimal("10000.00"),
            notary_fee=Decimal("0.00"),
            manager_commission=Decimal("0.00"),
            actor_role=UserRole.OWNER,
        )

        assert updated.total_amount == Decimal("10000.00")

    def test_unrecord_clears_paid_status(self):
        client = make_client()
        db = MagicMock()
        item = SimpleNamespace(
            client_id=CLIENT_ID,
            status=DocumentCollectionStatus.PAID,
            paid_date=date(2026, 7, 10),
        )
        db.scalar.return_value = item

        updated = unrecord_document_collection_payment(db, client)

        assert updated.status == DocumentCollectionStatus.PENDING
        assert updated.paid_date is None

    def test_unrecord_rejected_after_bankruptcy(self):
        client = make_client(EngagementStage.BANKRUPTCY)
        db = MagicMock()
        db.scalar.return_value = SimpleNamespace(
            status=DocumentCollectionStatus.PAID,
            paid_date=date(2026, 7, 10),
        )

        try:
            unrecord_document_collection_payment(db, client)
            assert False, "expected HTTPException"
        except Exception as exc:
            assert exc.status_code == 422

    def test_convert_requires_paid_collection(self):
        client = make_client()
        db = MagicMock()
        db.scalar.side_effect = [
            SimpleNamespace(status=DocumentCollectionStatus.PENDING),
            None,
        ]

        try:
            convert_client_to_bankruptcy(
                db,
                client,
                debt_amount=Decimal("350000.00"),
                contract_date=date(2026, 7, 15),
            )
            assert False, "expected HTTPException"
        except Exception as exc:
            assert exc.status_code == 422
