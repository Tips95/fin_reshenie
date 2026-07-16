"""add payment deferral and expense payment tracking

Revision ID: e1f2a3b45c06
Revises: d9e4a6b23c05
Create Date: 2026-07-16

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "e1f2a3b45c06"
down_revision: Union[str, None] = "d9e4a6b23c05"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "payment_schedule",
        sa.Column("deferred_until", sa.Date(), nullable=True),
    )
    op.add_column(
        "payment_schedule",
        sa.Column("deferral_comment", sa.Text(), nullable=True),
    )

    op.add_column(
        "operating_expenses",
        sa.Column(
            "expense_group",
            sa.Enum(
                "salary_project",
                "production",
                name="expensegroup",
                native_enum=False,
            ),
            nullable=False,
            server_default="production",
        ),
    )
    op.add_column(
        "operating_expenses",
        sa.Column("pay_day", sa.Integer(), nullable=True),
    )

    op.execute(
        "UPDATE operating_expenses SET expense_group = 'salary_project' WHERE category = 'salary'"
    )

    op.create_table(
        "expense_payments",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("expense_id", sa.Uuid(), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("payment_date", sa.Date(), nullable=False),
        sa.Column("period_month", sa.Date(), nullable=False),
        sa.Column("comment", sa.Text(), nullable=True),
        sa.Column("created_by", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["expense_id"], ["operating_expenses.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_expense_payments_expense_id", "expense_payments", ["expense_id"])
    op.create_index("ix_expense_payments_period_month", "expense_payments", ["period_month"])


def downgrade() -> None:
    op.drop_index("ix_expense_payments_period_month", table_name="expense_payments")
    op.drop_index("ix_expense_payments_expense_id", table_name="expense_payments")
    op.drop_table("expense_payments")
    op.drop_column("operating_expenses", "pay_day")
    op.drop_column("operating_expenses", "expense_group")
    op.drop_column("payment_schedule", "deferral_comment")
    op.drop_column("payment_schedule", "deferred_until")
