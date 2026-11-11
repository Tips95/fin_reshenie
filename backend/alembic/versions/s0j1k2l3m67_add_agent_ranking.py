"""add agent ranking and monthly awards

Revision ID: s0j1k2l3m67
Revises: r9i0j1k2l56
Create Date: 2026-11-11

Рейтинг удалённых менеджеров: премии «Лучший месяца» и последнее место агента
в рейтинге (для уведомлений «вы поднялись» / «вас обогнали»).
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "s0j1k2l3m67"
down_revision: Union[str, None] = "r9i0j1k2l56"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("users") as batch:
        batch.add_column(sa.Column("rank_month", sa.String(length=7), nullable=True))
        batch.add_column(sa.Column("rank_place", sa.Integer(), nullable=True))

    op.create_table(
        "agent_awards",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("agent_id", sa.Uuid(), nullable=False),
        sa.Column("month", sa.String(length=7), nullable=False),
        sa.Column("points", sa.Integer(), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("paid_by", sa.Uuid(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["agent_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["paid_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("organization_id", "month", name="uq_agent_awards_org_month"),
    )
    op.create_index("ix_agent_awards_agent_id", "agent_awards", ["agent_id"])


def downgrade() -> None:
    op.drop_index("ix_agent_awards_agent_id", table_name="agent_awards")
    op.drop_table("agent_awards")
    with op.batch_alter_table("users") as batch:
        batch.drop_column("rank_place")
        batch.drop_column("rank_month")
