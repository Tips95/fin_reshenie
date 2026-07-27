"""add manager_note to payment_schedule

Revision ID: n0c1d2e3f16
Revises: m0b1c2d3e4f15
Create Date: 2026-07-27

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "n0c1d2e3f16"
down_revision: Union[str, None] = "m0b1c2d3e4f15"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("payment_schedule", sa.Column("manager_note", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("payment_schedule", "manager_note")
