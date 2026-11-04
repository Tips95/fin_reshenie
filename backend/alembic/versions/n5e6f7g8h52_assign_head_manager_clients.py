"""assign clients concluded by a department head

Revision ID: n5e6f7g8h52
Revises: m4d5e6f7g51
Create Date: 2026-11-04

Начальник отдела заключает клиентов, но карточка оставалась без менеджера,
и его не было в выплатах 10 000 ₽. Пустое закрепление заполняется им.
Уже назначенный менеджер не трогается.
"""

from typing import Sequence, Union

from alembic import op

revision: str = "n5e6f7g8h52"
down_revision: Union[str, None] = "m4d5e6f7g51"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    from app.services.client_assignment import backfill_unassigned_client_managers

    backfill_unassigned_client_managers(op.get_bind())


def downgrade() -> None:
    # Нельзя отличить заполненные этой правкой закрепления от назначенных вручную.
    pass
