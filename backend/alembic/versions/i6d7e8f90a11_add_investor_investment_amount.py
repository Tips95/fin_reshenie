"""add investor investment_amount to users

Revision ID: i6d7e8f90a11
Revises: h5c6d7e89f10
Create Date: 2026-07-17

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "i6d7e8f90a11"
down_revision: Union[str, None] = "h5c6d7e89f10"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("investment_amount", sa.Numeric(12, 2), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("users", "investment_amount")
