"""add civil case document kind

Revision ID: b3q4r5s6t30
Revises: a2p3q4r5s29
Create Date: 2026-08-28
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "b3q4r5s6t30"
down_revision: Union[str, None] = "a2p3q4r5s29"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "civil_case_documents",
        sa.Column(
            "kind",
            sa.String(length=32),
            nullable=False,
            server_default="client",
        ),
    )


def downgrade() -> None:
    op.drop_column("civil_case_documents", "kind")
