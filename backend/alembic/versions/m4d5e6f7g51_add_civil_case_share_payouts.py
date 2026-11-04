"""add civil case share payout flags

Revision ID: m4d5e6f7g51
Revises: j1a2b3c4d48
Create Date: 2026-11-04

Отметки «доля выплачена» по гражданским делам.
Существующие дела остаются невыплаченными, суммы и клиенты не меняются.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "m4d5e6f7g51"
down_revision: Union[str, None] = "j1a2b3c4d48"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "civil_cases",
        sa.Column("manager_share_paid", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        "civil_cases",
        sa.Column("manager_share_paid_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "civil_cases",
        sa.Column("executor_share_paid", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        "civil_cases",
        sa.Column("executor_share_paid_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("civil_cases", "executor_share_paid_at")
    op.drop_column("civil_cases", "executor_share_paid")
    op.drop_column("civil_cases", "manager_share_paid_at")
    op.drop_column("civil_cases", "manager_share_paid")
