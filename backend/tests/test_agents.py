import uuid
from datetime import date
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.config import settings
from app.core.database import get_db
from app.main import app
from app.models import Base, Client, Payment
from app.models.enums import EngagementStage
from app.services.agents import AGENT_TERMS_VERSION

API = settings.API_PREFIX
AGENT_PHONE = "+79281112233"
LEAD_PHONE = "+79285556677"


@pytest.fixture()
def session_factory():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

    def override_get_db():
        db = factory()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    try:
        yield factory
    finally:
        app.dependency_overrides.pop(get_db, None)
        engine.dispose()


@pytest.fixture()
def api(session_factory):
    return TestClient(app)


def _auth(api: TestClient, login: str, password: str) -> dict[str, str]:
    response = api.post(f"{API}/auth/login", json={"login": login, "password": password})
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


@pytest.fixture()
def office(api):
    response = api.post(
        f"{API}/auth/register",
        json={"organization_name": "Решение", "login": "owner@co.ru", "password": "secret123"},
    )
    assert response.status_code == 201, response.text
    owner = {"Authorization": f"Bearer {response.json()['access_token']}"}
    manager = api.post(
        f"{API}/users",
        headers=owner,
        json={
            "full_name": "Петров Пётр",
            "email": "manager@co.ru",
            "telegram": "petrov_office",
            "password": "secret123",
            "role": "manager",
        },
    ).json()
    opened = api.put(f"{API}/agents/signup", headers=owner, json={"open": True})
    assert opened.json() == {"open": True}
    return {"owner": owner, "manager_id": manager["id"]}


def _register_agent(api: TestClient, **overrides) -> dict:
    payload = {
        "full_name": "Удалёнов Агент",
        "phone": AGENT_PHONE,
        "telegram": "@agent_remote",
        "inn": "123456789012",
        "password": "secret123",
        "accept_terms": True,
        "terms_version": AGENT_TERMS_VERSION,
        **overrides,
    }
    return api.post(f"{API}/auth/register-agent", json=payload)


def _approved_agent(api: TestClient, office: dict) -> tuple[str, dict[str, str]]:
    response = _register_agent(api)
    assert response.status_code == 201, response.text
    agent_id = api.get(f"{API}/agents", headers=office["owner"]).json()[0]["id"]
    return agent_id, {"Authorization": f"Bearer {response.json()['access_token']}"}


class TestRegistration:
    def test_signup_info_shows_company(self, api, office):
        response = api.get(f"{API}/auth/agent-signup")
        assert response.json() == {"open": True, "organization_name": "Решение"}

    def test_closed_signup_hides_button_and_stops_registration(self, api, office):
        api.put(f"{API}/agents/signup", headers=office["owner"], json={"open": False})
        assert api.get(f"{API}/auth/agent-signup").json() == {
            "open": False,
            "organization_name": None,
        }
        assert _register_agent(api).status_code == 404

    def test_signup_can_be_open_only_in_one_company(self, api, office):
        other = api.post(
            f"{API}/auth/register",
            json={"organization_name": "Другая", "login": "other@co.ru", "password": "secret123"},
        ).json()
        other_owner = {"Authorization": f"Bearer {other['access_token']}"}
        response = api.put(f"{API}/agents/signup", headers=other_owner, json={"open": True})
        assert response.status_code == 409

    def test_company_signup_is_closed_on_site(self, api, monkeypatch):
        monkeypatch.setattr(settings, "ALLOW_ORGANIZATION_SIGNUP", False)
        response = api.post(
            f"{API}/auth/register",
            json={"organization_name": "Чужая", "login": "x@co.ru", "password": "secret123"},
        )
        assert response.status_code == 403

    def test_terms_are_required(self, api, office):
        assert _register_agent(api, accept_terms=False).status_code == 422

    def test_outdated_terms_version_is_rejected(self, api, office):
        assert _register_agent(api, terms_version="2000-01-01").status_code == 409

    def test_registration_gives_access_and_records_terms(self, api, office):
        response = _register_agent(api)
        assert response.status_code == 201
        assert response.json()["access_token"]
        assert api.post(
            f"{API}/auth/login", json={"login": AGENT_PHONE, "password": "secret123"}
        ).status_code == 200
        agent = api.get(f"{API}/agents", headers=office["owner"]).json()[0]
        assert agent["is_active"] is True
        assert agent["terms_version"] == AGENT_TERMS_VERSION
        assert agent["terms_accepted_at"] is not None

    def test_curator_is_least_loaded_manager(self, api, office):
        second = api.post(
            f"{API}/users",
            headers=office["owner"],
            json={
                "full_name": "Сидоров Сидор",
                "email": "manager2@co.ru",
                "password": "secret123",
                "role": "manager",
            },
        ).json()
        _register_agent(api)
        _register_agent(api, phone="+79281112234")
        curators = {item["curator_id"] for item in api.get(f"{API}/agents", headers=office["owner"]).json()}
        assert curators == {office["manager_id"], second["id"]}

    def test_disabled_agent_gets_clear_login_message(self, api, office):
        _register_agent(api)
        agent_id = api.get(f"{API}/agents", headers=office["owner"]).json()[0]["id"]
        api.delete(f"{API}/users/{agent_id}", headers=office["owner"])
        response = api.post(
            f"{API}/auth/login", json={"login": AGENT_PHONE, "password": "secret123"}
        )
        assert response.status_code == 403
        assert "отключён" in response.json()["detail"]

    def test_wrong_password_of_disabled_agent_stays_generic(self, api, office):
        _register_agent(api)
        agent_id = api.get(f"{API}/agents", headers=office["owner"]).json()[0]["id"]
        api.delete(f"{API}/users/{agent_id}", headers=office["owner"])
        response = api.post(f"{API}/auth/login", json={"login": AGENT_PHONE, "password": "wrong1"})
        assert response.status_code == 401


class TestAgentAccess:
    def test_agent_sees_curator_contacts(self, api, office):
        _, agent = _approved_agent(api, office)
        overview = api.get(f"{API}/agents/me/overview", headers=agent).json()
        assert overview["curator"]["full_name"] == "Петров Пётр"
        assert overview["curator"]["telegram"] == "@petrov_office"

    def test_agent_is_blocked_from_office_sections(self, api, office):
        _, agent = _approved_agent(api, office)
        for path in ("/clients", "/dashboard/summary", "/payments", "/users"):
            assert api.get(f"{API}{path}", headers=agent).status_code == 403, path

    def test_lead_requires_personal_data_consent(self, api, office):
        _, agent = _approved_agent(api, office)
        response = api.post(f"{API}/questionnaires", headers=agent, json={"phone": LEAD_PHONE})
        assert response.status_code == 422

    def test_lead_goes_to_curator_and_stays_private(self, api, office):
        agent_id, agent = _approved_agent(api, office)
        lead = api.post(
            f"{API}/questionnaires",
            headers=agent,
            json={"phone": LEAD_PHONE, "full_name": "Клиентов Клиент", "pd_consent": True},
        ).json()
        assert lead["source_agent_id"] == agent_id
        assert lead["assigned_manager_id"] == office["manager_id"]
        assert lead["pd_consent_at"] is not None

        manager = _auth(api, "manager@co.ru", "secret123")
        assert api.get(f"{API}/questionnaires/{lead['id']}", headers=manager).status_code == 200

        owner_lead = api.post(
            f"{API}/questionnaires", headers=office["owner"], json={"phone": "+79280000001"}
        ).json()
        assert api.get(f"{API}/questionnaires/{owner_lead['id']}", headers=agent).status_code == 404
        listed = api.get(f"{API}/questionnaires", headers=agent).json()
        assert [item["id"] for item in listed] == [lead["id"]]

    def test_duplicate_does_not_reveal_existing_lead(self, api, office):
        _, agent = _approved_agent(api, office)
        api.post(
            f"{API}/questionnaires",
            headers=office["owner"],
            json={"phone": LEAD_PHONE, "full_name": "Секретов Секрет"},
        )
        response = api.post(
            f"{API}/questionnaires",
            headers=agent,
            json={"phone": "8 928 555-66-77", "pd_consent": True},
        )
        assert response.status_code == 409
        detail = response.json()["detail"]
        assert isinstance(detail, str)
        assert "Секретов" not in detail

    def test_agent_cannot_swap_phone_or_convert(self, api, office):
        _, agent = _approved_agent(api, office)
        lead = api.post(
            f"{API}/questionnaires",
            headers=agent,
            json={"phone": LEAD_PHONE, "pd_consent": True},
        ).json()
        swapped = api.patch(
            f"{API}/questionnaires/{lead['id']}", headers=agent, json={"phone": "+79280000002"}
        )
        assert swapped.status_code == 422
        convert = api.post(f"{API}/questionnaires/{lead['id']}/create-client", headers=agent, json={})
        assert convert.status_code == 403
        calls = api.post(
            f"{API}/questionnaires/{lead['id']}/calls", headers=agent, json={"outcome": "answered"}
        )
        assert calls.status_code == 403

    def test_agent_and_curator_exchange_comments(self, api, office):
        _, agent = _approved_agent(api, office)
        lead = api.post(
            f"{API}/questionnaires",
            headers=agent,
            json={"phone": LEAD_PHONE, "pd_consent": True},
        ).json()
        api.post(
            f"{API}/questionnaires/{lead['id']}/comments",
            headers=agent,
            json={"body": "Клиент спрашивает про ипотеку"},
        )
        manager = _auth(api, "manager@co.ru", "secret123")
        updated = api.post(
            f"{API}/questionnaires/{lead['id']}/comments",
            headers=manager,
            json={"body": "Приводите, разберём в офисе"},
        ).json()
        assert [c["author_role"] for c in updated["comments"]] == ["agent", "manager"]


class TestAgentPayouts:
    def _contract_with_payment(self, api, office, session_factory, *, paid: bool):
        agent_id, agent = _approved_agent(api, office)
        lead = api.post(
            f"{API}/questionnaires",
            headers=agent,
            json={"phone": LEAD_PHONE, "full_name": "Клиентов Клиент", "pd_consent": True},
        ).json()
        manager = _auth(api, "manager@co.ru", "secret123")
        converted = api.post(
            f"{API}/questionnaires/{lead['id']}/create-client", headers=manager, json={}
        ).json()
        db = session_factory()
        client = db.get(Client, uuid.UUID(converted["client_id"]))
        assert str(client.source_agent_id) == agent_id
        client.engagement_stage = EngagementStage.BANKRUPTCY
        client.contract_date = date(2026, 11, 2)
        if paid:
            db.add(
                Payment(
                    client_id=client.id,
                    amount=Decimal("15000.00"),
                    payment_date=date(2026, 11, 5),
                    created_by=client.assigned_manager_id,
                )
            )
        db.commit()
        db.close()
        return agent_id, agent, converted["client_id"]

    def test_nothing_is_earned_before_first_payment(self, api, office, session_factory):
        _, agent, _ = self._contract_with_payment(api, office, session_factory, paid=False)
        overview = api.get(f"{API}/agents/me/overview", headers=agent).json()
        assert overview["leads"][0]["stage"] == "contract"
        assert Decimal(overview["earned_total"]) == 0

        managers = api.get(
            f"{API}/analytics/manager-first-commissions?month=2026-11", headers=office["owner"]
        ).json()
        assert managers["clients_count"] == 0

    def test_first_payment_earns_five_thousand_each(self, api, office, session_factory):
        agent_id, agent, client_id = self._contract_with_payment(
            api, office, session_factory, paid=True
        )
        overview = api.get(f"{API}/agents/me/overview", headers=agent).json()
        assert overview["leads"][0]["stage"] == "earned"
        assert Decimal(overview["to_pay_total"]) == Decimal("5000")

        agents = api.get(f"{API}/agents/commissions?month=2026-11", headers=office["owner"]).json()
        assert Decimal(agents["to_pay_amount"]) == Decimal("5000")
        assert agents["agents"][0]["agent_id"] == agent_id

        managers = api.get(
            f"{API}/analytics/manager-first-commissions?month=2026-11", headers=office["owner"]
        ).json()
        item = managers["managers"][0]["clients"][0]
        assert Decimal(item["amount"]) == Decimal("5000")
        assert item["from_agent"] is True

        marked = api.post(
            f"{API}/agents/commissions/mark",
            headers=office["owner"],
            json={"client_ids": [client_id], "collected": True},
        )
        assert marked.json() == {"updated_count": 1}
        overview = api.get(f"{API}/agents/me/overview", headers=agent).json()
        assert overview["leads"][0]["stage"] == "paid_out"
        assert Decimal(overview["to_pay_total"]) == 0
