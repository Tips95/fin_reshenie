"""add civil case price

Revision ID: a2p3q4r5s29
Revises: z1o2p3q4r28
Create Date: 2026-08-28
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "a2p3q4r5s29"
down_revision: Union[str, None] = "z1o2p3q4r28"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "civil_cases",
        sa.Column(
            "price",
            sa.Numeric(precision=12, scale=2),
            nullable=False,
            server_default="0.00",
        ),
    )


def downgrade() -> None:
    op.drop_column("civil_cases", "price")
