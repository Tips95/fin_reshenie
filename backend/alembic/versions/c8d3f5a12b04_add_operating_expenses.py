"""add operating_expenses table

Revision ID: c8d3f5a12b04
Revises: b7c2e4f91a03
Create Date: 2026-07-16

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c8d3f5a12b04"
down_revision: Union[str, None] = "b7c2e4f91a03"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "operating_expenses",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column(
            "category",
            sa.Enum(
                "salary",
                "rent",
                "utilities",
                "marketing",
                "other",
                name="expensecategory",
            ),
            nullable=False,
        ),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["organization_id"],
            ["organizations.id"],
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_operating_expenses_organization_id",
        "operating_expenses",
        ["organization_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_operating_expenses_organization_id", table_name="operating_expenses")
    op.drop_table("operating_expenses")
    op.execute("DROP TYPE IF EXISTS expensecategory")
