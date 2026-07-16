"""Smoke test all main API endpoints."""
from __future__ import annotations

import sys
from uuid import UUID

import httpx

BASE = "http://localhost:8000/api"
LOGIN = "admin@reshenie.local"
PASSWORD = "admin123"


def fail(msg: str) -> None:
    print(f"FAIL: {msg}")
    sys.exit(1)


def ok(msg: str) -> None:
    print(f"OK: {msg}")


def main() -> None:
    with httpx.Client(base_url=BASE, timeout=30.0) as client:
        r = client.get("/health")
        if r.status_code != 200:
            fail(f"health {r.status_code}")
        ok("health")

        r = client.post("/auth/login", json={"login": LOGIN, "password": PASSWORD})
        if r.status_code != 200:
            fail(f"login {r.status_code} {r.text}")
        token = r.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        ok("login")

        endpoints: list[tuple[str, str]] = [
            ("GET", "/auth/me"),
            ("GET", "/dashboard/summary"),
            ("GET", "/analytics/overview?months=3"),
            ("GET", "/funnel/overview"),
            ("GET", "/tasks?status=open"),
            ("GET", "/clients"),
            ("GET", "/audit-logs/recent?limit=5"),
            ("GET", "/users"),
            ("GET", "/pricing-tiers"),
            ("GET", "/operating-expenses"),
            ("GET", "/operating-expenses/payments"),
        ]

        for method, path in endpoints:
            r = client.request(method, path, headers=headers)
            if r.status_code != 200:
                fail(f"{method} {path} -> {r.status_code} {r.text[:200]}")
            ok(f"{method} {path}")

        clients = client.get("/clients", headers=headers).json()
        if not clients:
            fail("no clients in database")
        client_id = clients[0]["id"]
        ok(f"clients list ({len(clients)} items)")

        r = client.get(f"/clients/{client_id}/detail", headers=headers)
        if r.status_code != 200:
            fail(f"client detail {r.status_code}")
        ok("client detail")

        r = client.get(f"/exports/clients.xlsx", headers=headers)
        if r.status_code != 200 or "spreadsheetml" not in r.headers.get("content-type", ""):
            fail(f"export clients {r.status_code}")
        ok("export clients.xlsx")

        r = client.get(f"/exports/clients/{client_id}.xlsx", headers=headers)
        if r.status_code != 200:
            fail(f"export client detail {r.status_code}")
        ok("export client detail.xlsx")

        r = client.get("/exports/overdue-clients.xlsx", headers=headers)
        if r.status_code != 200:
            fail(f"export overdue {r.status_code}")
        ok("export overdue.xlsx")

        # PATCH procedure_stage roundtrip
        original_stage = clients[0].get("procedure_stage", "contract_signed")
        r = client.patch(
            f"/clients/{client_id}",
            headers=headers,
            json={"procedure_stage": original_stage},
        )
        if r.status_code != 200:
            fail(f"patch client {r.status_code} {r.text}")
        ok("patch client")

        tasks = client.get("/tasks?status=open", headers=headers).json()
        if tasks:
            task_id = tasks[0]["id"]
            r = client.patch(
                f"/tasks/{task_id}",
                headers=headers,
                json={"status": "done"},
            )
            if r.status_code != 200:
                fail(f"patch task {r.status_code}")
            ok("patch task")
        else:
            ok("tasks (empty)")

        try:
            UUID(client_id)
        except ValueError:
            fail("invalid client id")

    print("\nAll smoke tests passed.")


if __name__ == "__main__":
    main()
