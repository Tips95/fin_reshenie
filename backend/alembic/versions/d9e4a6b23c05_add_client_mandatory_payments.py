"""add client_mandatory_payments table

Revision ID: d9e4a6b23c05
Revises: c8d3f5a12b04
Create Date: 2026-07-16

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "d9e4a6b23c05"
down_revision: Union[str, None] = "c8d3f5a12b04"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "client_mandatory_payments",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("client_id", sa.Uuid(), nullable=False),
        sa.Column(
            "payment_type",
            sa.Enum(
                "deposit",
                "financial_management",
                "court_fee",
                name="mandatorypaymenttype",
            ),
            nullable=False,
        ),
        sa.Column("planned_amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("paid_amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("paid_date", sa.Date(), nullable=True),
        sa.Column(
            "status",
            sa.Enum(
                "pending",
                "paid",
                "partial",
                "not_applicable",
                name="mandatorypaymentstatus",
            ),
            nullable=False,
        ),
        sa.Column("is_applicable", sa.Boolean(), nullable=False),
        sa.Column("comment", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["client_id"], ["clients.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("client_id", "payment_type", name="uq_client_mandatory_payment_type"),
    )
    op.create_index(
        "ix_client_mandatory_payments_client_id",
        "client_mandatory_payments",
        ["client_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_client_mandatory_payments_client_id", table_name="client_mandatory_payments")
    op.drop_table("client_mandatory_payments")
    op.execute("DROP TYPE IF EXISTS mandatorypaymenttype")
    op.execute("DROP TYPE IF EXISTS mandatorypaymentstatus")
