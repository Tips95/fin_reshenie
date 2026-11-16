"""rebalance remote managers evenly between owners

Revision ID: u2l3m4n5o89
Revises: t1k2l3m4n78
Create Date: 2026-11-16

Удалённые менеджеры были закреплены за отмеченными кураторами, а у части руководителей
два аккаунта (руководитель и менеджер) — им доставалась двойная доля. Теперь кураторы —
руководители, по одному аккаунту на человека; здесь раскидываем уже зарегистрированных.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

from app.services.agent_balance import plan_even_split

revision: str = "u2l3m4n5o89"
down_revision: Union[str, None] = "t1k2l3m4n78"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    organization_ids = conn.execute(
        sa.text("SELECT DISTINCT organization_id FROM users WHERE lower(role) = 'agent'")
    ).scalars().all()
    for organization_id in organization_ids:
        params = {"org": organization_id, "active": True}
        owners = conn.execute(
            sa.text(
                "SELECT id FROM users WHERE organization_id = :org AND lower(role) = 'owner' "
                "AND is_active = :active AND deleted_at IS NULL ORDER BY created_at"
            ),
            params,
        ).scalars().all()
        agents = conn.execute(
            sa.text(
                "SELECT id, curator_id FROM users WHERE organization_id = :org AND lower(role) = 'agent' "
                "AND is_active = :active AND deleted_at IS NULL ORDER BY created_at"
            ),
            params,
        ).all()
        changes = plan_even_split([(row.id, row.curator_id) for row in agents], owners)
        for agent_id, curator_id in changes.items():
            conn.execute(
                sa.text("UPDATE users SET curator_id = :curator WHERE id = :agent"),
                {"curator": curator_id, "agent": agent_id},
            )


def downgrade() -> None:
    pass
