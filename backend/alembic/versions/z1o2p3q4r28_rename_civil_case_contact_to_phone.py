"""rename civil case contact_info to phone

Revision ID: z1o2p3q4r28
Revises: y0n1o2p3q27
Create Date: 2026-08-28
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "z1o2p3q4r28"
down_revision: Union[str, None] = "y0n1o2p3q27"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "civil_cases",
        "contact_info",
        new_column_name="phone",
        existing_type=sa.Text(),
        existing_nullable=False,
        existing_server_default="",
    )


def downgrade() -> None:
    op.alter_column(
        "civil_cases",
        "phone",
        new_column_name="contact_info",
        existing_type=sa.Text(),
        existing_nullable=False,
        existing_server_default="",
    )
