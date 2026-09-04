"""add cash balances

Revision ID: e6t7u8v9w33
Revises: d5s6t7u8v32
Create Date: 2026-09-04

Кубышка: остаток кассы на начало месяца, вводится руководителем вручную.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "e6t7u8v9w33"
down_revision: Union[str, None] = "d5s6t7u8v32"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "cash_balances",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("period_month", sa.Date(), nullable=False),
        sa.Column("opening_amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("comment", sa.Text(), nullable=True),
        sa.Column("updated_by", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["updated_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("organization_id", "period_month", name="uq_cash_balances_org_month"),
    )
    op.create_index("ix_cash_balances_organization_id", "cash_balances", ["organization_id"])
    op.create_index("ix_cash_balances_period_month", "cash_balances", ["period_month"])


def downgrade() -> None:
    op.drop_index("ix_cash_balances_period_month", table_name="cash_balances")
    op.drop_index("ix_cash_balances_organization_id", table_name="cash_balances")
    op.drop_table("cash_balances")
