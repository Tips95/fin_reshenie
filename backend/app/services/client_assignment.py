"""Закрепление уже созданных клиентов за начальником отдела, который их заключил."""

from sqlalchemy import text
from sqlalchemy.engine import Connection


def backfill_unassigned_client_managers(connection: Connection) -> int:
    """Пустое закрепление заполняется менеджером анкеты или тем, кто создал карточку.

    Уже назначенный менеджер не меняется.
    """
    updated = 0
    questionnaire_rows = connection.execute(
        text(
            """
            SELECT c.id AS client_id, q.assigned_manager_id AS manager_id, q.created_at AS created_at
            FROM clients c
            JOIN client_questionnaires q ON q.client_id = c.id
            JOIN users u ON u.id = q.assigned_manager_id
            WHERE c.assigned_manager_id IS NULL
              AND u.role IN ('manager', 'head_manager')
            ORDER BY q.created_at ASC
            """
        )
    ).fetchall()
    chosen: dict = {}
    for row in questionnaire_rows:
        chosen[row.client_id] = row.manager_id

    audit_rows = connection.execute(
        text(
            """
            SELECT c.id AS client_id, a.changed_by AS manager_id
            FROM clients c
            JOIN audit_logs a
              ON a.entity_id = c.id
             AND a.entity_type = 'client'
             AND a.action IN ('create', 'CREATE')
            JOIN users u ON u.id = a.changed_by
            WHERE c.assigned_manager_id IS NULL
              AND u.role = 'head_manager'
            ORDER BY a.changed_at ASC
            """
        )
    ).fetchall()
    for row in audit_rows:
        chosen.setdefault(row.client_id, row.manager_id)

    for client_id, manager_id in chosen.items():
        result = connection.execute(
            text(
                """
                UPDATE clients
                SET assigned_manager_id = :manager_id
                WHERE id = :client_id
                  AND assigned_manager_id IS NULL
                """
            ),
            {"client_id": client_id, "manager_id": manager_id},
        )
        updated += result.rowcount or 0
    return updated
