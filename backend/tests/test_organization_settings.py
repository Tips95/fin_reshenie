from types import SimpleNamespace

from app.schemas.organization import organization_features, serialize_organization
from app.models.enums import OrganizationType
import uuid
from datetime import datetime, timezone


def test_organization_features_default_to_enabled():
    organization = SimpleNamespace()
    features = organization_features(organization)
    assert features.document_collection is True
    assert features.tasks is True
    assert features.expenses is True
    assert features.pricing is True
    assert features.analytics is True
    assert features.investors is True


def test_organization_features_respect_disabled_flags():
    organization = SimpleNamespace(
        feature_document_collection=False,
        feature_tasks=True,
        feature_expenses=False,
        feature_pricing=True,
        feature_analytics=False,
        feature_investors=True,
    )
    features = organization_features(organization)
    assert features.document_collection is False
    assert features.expenses is False
    assert features.analytics is False
    assert features.tasks is True


def test_serialize_organization_includes_type_and_features():
    organization = SimpleNamespace(
        id=uuid.uuid4(),
        name="Тест",
        organization_type=OrganizationType.BANKRUPTCY,
        created_at=datetime.now(timezone.utc),
        feature_document_collection=False,
        feature_tasks=True,
        feature_expenses=True,
        feature_pricing=True,
        feature_analytics=True,
        feature_investors=True,
    )
    payload = serialize_organization(organization)
    assert payload.name == "Тест"
    assert payload.organization_type == OrganizationType.BANKRUPTCY
    assert payload.features.document_collection is False
