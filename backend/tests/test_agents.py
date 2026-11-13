import importlib.util
import uuid
from datetime import date
from decimal import Decimal
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.config import settings
from app.core.database import get_db
from app.main import app
from app.models import Base, Client, Payment
from app.core.time import local_today
from app.models.enums import EngagementStage
from app.services import agent_ranking
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
            "is_agent_curator": True,
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

    def test_curator_is_least_loaded_of_marked_curators(self, api, office):
        second = api.post(
            f"{API}/users",
            headers=office["owner"],
            json={
                "full_name": "Сидоров Сидор",
                "email": "manager2@co.ru",
                "password": "secret123",
                "role": "manager",
                "is_agent_curator": True,
            },
        ).json()
        _second_manager(api, office, email="plain@co.ru")
        _register_agent(api)
        _register_agent(api, phone="+79281112234")
        _register_agent(api, phone="+79281112235")
        curators = [item["curator_id"] for item in api.get(f"{API}/agents", headers=office["owner"]).json()]
        assert set(curators) == {office["manager_id"], second["id"]}

    def test_only_marked_staff_can_be_curator(self, api, office):
        agent_id, _ = _approved_agent(api, office)
        plain = api.post(
            f"{API}/users",
            headers=office["owner"],
            json={"full_name": "Простов Прост", "email": "p@co.ru", "password": "secret123", "role": "manager"},
        ).json()
        response = api.patch(
            f"{API}/agents/{agent_id}/curator", headers=office["owner"], json={"curator_id": plain["id"]}
        )
        assert response.status_code == 422
        names = [item["full_name"] for item in api.get(f"{API}/agents/curators", headers=office["owner"]).json()]
        assert names == ["Петров Пётр"]

    def test_curator_flag_needs_office_role(self, api, office):
        response = api.post(
            f"{API}/users",
            headers=office["owner"],
            json={
                "full_name": "Сборов Сбор",
                "email": "c@co.ru",
                "password": "secret123",
                "role": "call_center",
                "is_agent_curator": True,
            },
        )
        assert response.status_code == 422

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


class TestUserRemoval:
    def test_removed_user_disappears_and_frees_login(self, api, office):
        owner = office["owner"]
        manager_id = office["manager_id"]
        _approved_agent(api, office)
        assert api.get(f"{API}/agents", headers=owner).json()[0]["curator_id"] == manager_id

        response = api.delete(f"{API}/users/{manager_id}?permanent=true", headers=owner)
        assert response.status_code == 204

        assert manager_id not in [item["id"] for item in api.get(f"{API}/users", headers=owner).json()]
        assert api.get(f"{API}/users/{manager_id}", headers=owner).status_code == 404
        assert api.get(f"{API}/agents", headers=owner).json()[0]["curator_id"] is None
        assert api.post(
            f"{API}/auth/login", json={"login": "manager@co.ru", "password": "secret123"}
        ).status_code == 401

        again = api.post(
            f"{API}/users",
            headers=owner,
            json={"full_name": "Петров Пётр", "email": "manager@co.ru", "password": "secret123", "role": "manager"},
        )
        assert again.status_code == 201, again.text

    def test_removed_agent_leaves_agents_section(self, api, office):
        agent_id, _ = _approved_agent(api, office)
        api.delete(f"{API}/users/{agent_id}?permanent=true", headers=office["owner"])
        assert api.get(f"{API}/agents", headers=office["owner"]).json() == []
        assert api.post(
            f"{API}/auth/login", json={"login": AGENT_PHONE, "password": "secret123"}
        ).status_code == 401

    def test_cannot_remove_self(self, api, office):
        me = api.get(f"{API}/auth/me", headers=office["owner"]).json()
        response = api.delete(f"{API}/users/{me['id']}?permanent=true", headers=office["owner"])
        assert response.status_code == 400


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

    def test_agent_reads_price_list_but_cannot_edit_tiers(self, api, office):
        _, agent = _approved_agent(api, office)
        price = api.get(f"{API}/agents/price-list", headers=agent).json()
        assert price["document_collection_total"] == "13000.00"
        mins = [Decimal(tier["min_amount"]) for tier in price["tiers"]]
        assert mins and mins == sorted(mins) and mins[0] == Decimal("300000")

        assert api.get(f"{API}/pricing-tiers", headers=agent).status_code == 403
        tier = price["tiers"][0]
        response = api.post(f"{API}/pricing-tiers", headers=agent, json=tier)
        assert response.status_code == 403

    def test_price_list_shows_only_current_tier_version(self, api, office):
        _, agent = _approved_agent(api, office)
        old = api.get(f"{API}/agents/price-list", headers=agent).json()["tiers"]
        first = old[0]
        api.post(
            f"{API}/pricing-tiers",
            headers=office["owner"],
            json={
                **{key: first[key] for key in (
                    "min_amount", "max_amount", "first_month_payment",
                    "second_month_payment", "remaining_months_count", "total_months",
                )},
                "total_cost": "155000.00",
                "remaining_month_payment": "19000.00",
                "effective_from": date.today().isoformat(),
            },
        ).raise_for_status()

        tiers = api.get(f"{API}/agents/price-list", headers=agent).json()["tiers"]
        assert len(tiers) == len(old)
        assert tiers[0]["total_cost"] == "155000.00"

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


def _second_manager(
    api: TestClient, office: dict, *, email: str = "manager2@co.ru", curator: bool = False
) -> dict[str, str]:
    api.post(
        f"{API}/users",
        headers=office["owner"],
        json={
            "full_name": "Сидоров Сидор",
            "email": email,
            "password": "secret123",
            "role": "manager",
            "is_agent_curator": curator,
        },
    )
    return _auth(api, email, "secret123")


def _notifications(api: TestClient, headers: dict[str, str]) -> list[dict]:
    return api.get(f"{API}/notifications", headers=headers).json()["items"]


def test_migration_marks_the_three_approved_curators():
    path = Path(__file__).resolve().parents[1] / "alembic" / "versions" / "r9i0j1k2l56_add_notifications.py"
    spec = importlib.util.spec_from_file_location("curators_migration", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    for name in ("Ииев Ризван", "Юнусов Магомед Русланович", "ДЕРБИШЕВ РУСТАМ", "Рустам Дербишев"):
        assert module._is_listed_curator(name), name
    for name in ("Ииев Ахмед", "Магомедов Магомед", "Петров Пётр"):
        assert not module._is_listed_curator(name), name


class TestAgentSection:
    def test_regular_manager_sees_no_agents(self, api, office):
        agent_id, _ = _approved_agent(api, office)
        curator = _auth(api, "manager@co.ru", "secret123")
        other = _second_manager(api, office)

        assert [item["id"] for item in api.get(f"{API}/agents", headers=curator).json()] == [agent_id]
        assert api.get(f"{API}/agents", headers=other).json() == []
        assert api.get(f"{API}/agents/{agent_id}", headers=other).status_code == 404

    def test_every_curator_sees_every_agent_and_their_leads(self, api, office):
        agent_id, agent = _approved_agent(api, office)
        lead = api.post(
            f"{API}/questionnaires",
            headers=agent,
            json={"phone": LEAD_PHONE, "pd_consent": True},
        ).json()
        other_curator = _second_manager(api, office, curator=True)

        assert [item["id"] for item in api.get(f"{API}/agents", headers=other_curator).json()] == [agent_id]
        assert api.get(f"{API}/agents/{agent_id}", headers=other_curator).status_code == 200
        assert api.get(f"{API}/questionnaires/{lead['id']}", headers=other_curator).status_code == 200
        listed = api.get(f"{API}/questionnaires", headers=other_curator).json()
        assert [item["id"] for item in listed] == [lead["id"]]

    def test_agent_card_has_stats_leads_and_note(self, api, office):
        agent_id, agent = _approved_agent(api, office)
        api.post(
            f"{API}/questionnaires",
            headers=agent,
            json={"phone": LEAD_PHONE, "full_name": "Клиентов Клиент", "pd_consent": True},
        )
        curator = _auth(api, "manager@co.ru", "secret123")
        noted = api.patch(
            f"{API}/agents/{agent_id}/note", headers=curator, json={"note": "  Работает по Грозному "}
        )
        assert noted.json()["agent_note"] == "Работает по Грозному"

        card = api.get(f"{API}/agents/{agent_id}", headers=curator).json()
        assert card["agent"]["leads_total"] == 1
        assert card["agent"]["agent_note"] == "Работает по Грозному"
        assert [row["full_name"] for row in card["overview"]["leads"]] == ["Клиентов Клиент"]

    def test_only_admins_change_curator_or_disable(self, api, office):
        agent_id, _ = _approved_agent(api, office)
        curator = _auth(api, "manager@co.ru", "secret123")
        assert api.patch(
            f"{API}/agents/{agent_id}/active", headers=curator, json={"is_active": False}
        ).status_code == 403
        assert api.patch(
            f"{API}/agents/{agent_id}/curator", headers=curator, json={"curator_id": None}
        ).status_code == 403

        disabled = api.patch(
            f"{API}/agents/{agent_id}/active", headers=office["owner"], json={"is_active": False}
        )
        assert disabled.json()["is_active"] is False

    def test_agent_cannot_open_section(self, api, office):
        _, agent = _approved_agent(api, office)
        assert api.get(f"{API}/agents", headers=agent).status_code == 403
        assert api.get(f"{API}/agents/curators", headers=agent).status_code == 403


class TestNotifications:
    def test_curator_is_notified_about_new_agent(self, api, office):
        agent_id, _ = _approved_agent(api, office)
        curator = _auth(api, "manager@co.ru", "secret123")
        items = _notifications(api, curator)
        assert [item["kind"] for item in items] == ["agent_assigned"]
        assert items[0]["link"] == f"/agents/{agent_id}"

    def test_reassigning_notifies_new_curator(self, api, office):
        agent_id, _ = _approved_agent(api, office)
        other = _second_manager(api, office, curator=True)
        other_id = next(
            item["id"]
            for item in api.get(f"{API}/agents/curators", headers=office["owner"]).json()
            if item["full_name"] == "Сидоров Сидор"
        )
        api.patch(f"{API}/agents/{agent_id}/curator", headers=office["owner"], json={"curator_id": other_id})
        assert [item["kind"] for item in _notifications(api, other)] == ["agent_assigned"]

    def test_curator_gets_lead_edits_and_questions(self, api, office):
        _, agent = _approved_agent(api, office)
        curator = _auth(api, "manager@co.ru", "secret123")
        api.post(f"{API}/notifications/read", headers=curator, json={})
        lead = api.post(
            f"{API}/questionnaires",
            headers=agent,
            json={"phone": LEAD_PHONE, "full_name": "Клиентов Клиент", "pd_consent": True},
        ).json()
        for notes in ("первая правка", "вторая правка"):
            api.patch(
                f"{API}/questionnaires/{lead['id']}",
                headers=agent,
                json={"phone": LEAD_PHONE, "full_name": "Клиентов Клиент", "notes": notes},
            )
        api.post(
            f"{API}/questionnaires/{lead['id']}/comments",
            headers=agent,
            json={"body": "Когда можно привести?"},
        )

        items = _notifications(api, curator)[:3]
        assert [item["kind"] for item in items] == [
            "agent_comment",
            "agent_lead_updated",
            "agent_lead_created",
        ]
        assert "Когда можно привести?" in items[0]["body"]
        assert all(item["link"] == f"/questionnaires/{lead['id']}" for item in items)
        assert api.get(f"{API}/notifications/unread-count", headers=curator).json() == {"count": 3}

        left = api.post(f"{API}/notifications/read", headers=curator, json={"ids": [items[0]["id"]]})
        assert left.json() == {"count": 2}
        assert api.post(f"{API}/notifications/read", headers=curator, json={}).json() == {"count": 0}

    def test_agent_hears_back_from_office(self, api, office):
        _, agent = _approved_agent(api, office)
        lead = api.post(
            f"{API}/questionnaires",
            headers=agent,
            json={"phone": LEAD_PHONE, "full_name": "Клиентов Клиент", "pd_consent": True},
        ).json()
        curator = _auth(api, "manager@co.ru", "secret123")
        api.post(
            f"{API}/questionnaires/{lead['id']}/comments",
            headers=curator,
            json={"body": "Приводите в четверг"},
        )
        api.post(
            f"{API}/questionnaires/{lead['id']}/appointment",
            headers=curator,
            json={"appointment_at": "2026-11-20"},
        )
        api.post(f"{API}/questionnaires/{lead['id']}/create-client", headers=curator, json={})

        items = [item for item in _notifications(api, agent) if not item["kind"].startswith("rank_")]
        assert [item["kind"] for item in items] == ["lead_visited", "lead_appointment", "lead_reply"]
        assert items[1]["body"] == "Приём 20.11.2026"

    def test_own_actions_do_not_notify(self, api, office):
        curator = _auth(api, "manager@co.ru", "secret123")
        api.post(f"{API}/questionnaires", headers=curator, json={"phone": LEAD_PHONE})
        assert _notifications(api, curator) == []


class TestRanking:
    def _agent(self, api, *, phone: str, name: str, inn: str) -> dict[str, str]:
        response = _register_agent(
            api, phone=phone, full_name=name, inn=inn, telegram=f"@{inn}"
        )
        assert response.status_code == 201, response.text
        return {"Authorization": f"Bearer {response.json()['access_token']}"}

    def _visit(self, api, agent, *, phone: str, client: str = "Клиентов Клиент") -> str:
        lead = api.post(
            f"{API}/questionnaires",
            headers=agent,
            json={"phone": phone, "full_name": client, "pd_consent": True},
        ).json()
        manager = _auth(api, "manager@co.ru", "secret123")
        converted = api.post(
            f"{API}/questionnaires/{lead['id']}/create-client", headers=manager, json={}
        )
        assert converted.status_code == 200, converted.text
        return converted.json()["client_id"]

    def _first_payment(self, api, office, session_factory, client_id: str, day: date) -> None:
        db = session_factory()
        client = db.get(Client, uuid.UUID(client_id))
        client.engagement_stage = EngagementStage.BANKRUPTCY
        client.contract_date = day
        db.commit()
        db.close()
        response = api.post(
            f"{API}/payments",
            headers=office["owner"],
            json={"client_id": client_id, "amount": "15000.00", "payment_date": day.isoformat()},
        )
        assert response.status_code == 201, response.text

    def test_points_places_and_overtake_notifications(self, api, office, session_factory):
        first = self._agent(api, phone="+79281110001", name="Алиев Ахмед", inn="123456789001")
        second = self._agent(api, phone="+79281110002", name="Борзов Борис", inn="123456789002")

        def by_kind(headers, kind):
            return [item for item in _notifications(api, headers) if item["kind"] == kind]

        self._visit(api, first, phone="+79285550001")
        assert by_kind(first, "rank_up")[0]["title"] == "Вы лидер рейтинга месяца!"

        client_id = self._visit(api, second, phone="+79285550002", client="Другов Клиент")
        assert by_kind(second, "rank_up")[0]["title"] == "Вы поднялись на 2 место в рейтинге"
        self._first_payment(api, office, session_factory, client_id, local_today())

        assert by_kind(second, "rank_up")[0]["title"] == "Вы лидер рейтинга месяца!"
        overtaken = by_kind(first, "rank_down")[0]
        assert overtaken["title"] == "Вас обогнали — теперь вы на 2 месте"
        assert "Борис Б." in overtaken["body"] and "Борзов" not in overtaken["body"]

        ranking = api.get(f"{API}/agents/ranking", headers=first).json()
        assert [(row["name"], row["points"]) for row in ranking["entries"]] == [
            ("Борис Б.", 6),
            ("Ахмед А.", 1),
        ]
        assert ranking["me"] == {"place": 2, "points": 1, "gap_to_next": 6}
        assert all(row["agent_id"] is None for row in ranking["entries"])

        office_view = api.get(f"{API}/agents/ranking", headers=office["owner"]).json()
        assert [row["name"] for row in office_view["entries"]] == ["Борзов Борис", "Алиев Ахмед"]
        assert office_view["entries"][0]["agent_id"] and office_view["me"] is None
        regular = _second_manager(api, office)
        assert api.get(f"{API}/agents/ranking", headers=regular).status_code == 403

    def test_best_of_month_gets_badge_and_bonus_in_payouts(
        self, api, office, session_factory, monkeypatch
    ):
        agent = self._agent(api, phone="+79281110003", name="Алиев Ахмед", inn="123456789003")
        client_id = self._visit(api, agent, phone="+79285550003")
        self._first_payment(api, office, session_factory, client_id, date(2026, 11, 5))

        monkeypatch.setattr(agent_ranking, "local_today", lambda: date(2026, 12, 3))
        payouts = api.get(f"{API}/agents/commissions?month=2026-11", headers=office["owner"]).json()
        assert [Decimal(award["amount"]) for award in payouts["awards"]] == [Decimal("30000")]
        assert Decimal(payouts["to_pay_amount"]) == Decimal("35000")
        assert any(item["kind"] == "agent_award" for item in _notifications(api, agent))

        overview = api.get(f"{API}/agents/me/overview", headers=agent).json()
        assert Decimal(overview["to_pay_total"]) == Decimal("35000")
        ranking = api.get(f"{API}/agents/ranking?period=all", headers=agent).json()
        assert ranking["winners"][0]["month"] == "2026-11" and ranking["winners"][0]["is_me"]
        assert ranking["entries"][0]["wins"] == 1

        award_id = payouts["awards"][0]["id"]
        assert api.patch(
            f"{API}/agents/awards/{award_id}", headers=agent, json={"paid": True}
        ).status_code == 403
        paid = api.patch(
            f"{API}/agents/awards/{award_id}", headers=office["owner"], json={"paid": True}
        )
        assert paid.json()["paid"] is True
        overview = api.get(f"{API}/agents/me/overview", headers=agent).json()
        assert Decimal(overview["to_pay_total"]) == Decimal("5000")

    def test_no_bonus_without_a_contract(self, api, office, monkeypatch):
        agent = self._agent(api, phone="+79281110004", name="Алиев Ахмед", inn="123456789004")
        self._visit(api, agent, phone="+79285550004")

        monkeypatch.setattr(agent_ranking, "local_today", lambda: date(2026, 12, 3))
        payouts = api.get(f"{API}/agents/commissions?month=2026-11", headers=office["owner"]).json()
        assert payouts["awards"] == []


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
