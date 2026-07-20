"""add overdue_waived to payment_schedule

Revision ID: j7e8f9a01b12
Revises: i6d7e8f90a11
Create Date: 2026-07-20

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "j7e8f9a01b12"
down_revision: Union[str, None] = "i6d7e8f90a11"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "payment_schedule",
        sa.Column("overdue_waived", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.alter_column("payment_schedule", "overdue_waived", server_default=None)


def downgrade() -> None:
    op.drop_column("payment_schedule", "overdue_waived")
