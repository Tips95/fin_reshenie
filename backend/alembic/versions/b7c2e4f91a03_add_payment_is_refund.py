"""add is_refund to payments

Revision ID: b7c2e4f91a03
Revises: aad46f1b2f73
Create Date: 2026-07-15

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "b7c2e4f91a03"
down_revision: Union[str, None] = "aad46f1b2f73"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "payments",
        sa.Column("is_refund", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.alter_column("payments", "is_refund", server_default=None)


def downgrade() -> None:
    op.drop_column("payments", "is_refund")
