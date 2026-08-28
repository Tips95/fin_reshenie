"""add contact_info to civil cases

Revision ID: y0n1o2p3q27
Revises: x9m0n1o2p26
Create Date: 2026-08-28
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "y0n1o2p3q27"
down_revision: Union[str, None] = "x9m0n1o2p26"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "civil_cases",
        sa.Column("contact_info", sa.Text(), nullable=False, server_default=""),
    )


def downgrade() -> None:
    op.drop_column("civil_cases", "contact_info")
