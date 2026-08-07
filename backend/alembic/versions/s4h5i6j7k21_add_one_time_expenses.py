"""add one_time_expenses table

Revision ID: s4h5i6j7k21
Revises: q2f3g4h5i19
Create Date: 2026-08-07

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "s4h5i6j7k21"
down_revision: Union[str, None] = "r3g4h5i6j20"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "one_time_expenses",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("amount", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column("period_month", sa.Date(), nullable=False),
        sa.Column("expense_date", sa.Date(), nullable=False),
        sa.Column("comment", sa.Text(), nullable=True),
        sa.Column("created_by", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_one_time_expenses_organization_id",
        "one_time_expenses",
        ["organization_id"],
    )
    op.create_index(
        "ix_one_time_expenses_period_month",
        "one_time_expenses",
        ["period_month"],
    )


def downgrade() -> None:
    op.drop_index("ix_one_time_expenses_period_month", table_name="one_time_expenses")
    op.drop_index("ix_one_time_expenses_organization_id", table_name="one_time_expenses")
    op.drop_table("one_time_expenses")
