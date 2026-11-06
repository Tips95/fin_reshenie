import pytest

from app.core.config import settings


@pytest.fixture(autouse=True)
def allow_organization_signup(monkeypatch):
    """Тесты создают компании через /auth/register; на сайте регистрация закрыта."""
    monkeypatch.setattr(settings, "ALLOW_ORGANIZATION_SIGNUP", True)
