"""add manager first payment commission tracking

Revision ID: o0d1e2f3g17
Revises: n0c1d2e3f16
Create Date: 2026-07-29

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "o0d1e2f3g17"
down_revision: Union[str, None] = "n0c1d2e3f16"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "clients",
        sa.Column(
            "manager_first_commission_collected",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    op.add_column(
        "clients",
        sa.Column("manager_first_commission_collected_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "clients",
        sa.Column("manager_first_commission_collected_by", sa.Uuid(), nullable=True),
    )
    op.create_foreign_key(
        "fk_clients_manager_first_commission_collected_by_users",
        "clients",
        "users",
        ["manager_first_commission_collected_by"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_clients_manager_first_commission_collected_by_users",
        "clients",
        type_="foreignkey",
    )
    op.drop_column("clients", "manager_first_commission_collected_by")
    op.drop_column("clients", "manager_first_commission_collected_at")
    op.drop_column("clients", "manager_first_commission_collected")
