"""add organization green api credentials

Revision ID: y6q7r8s9t03
Revises: x5p6q7r8s92
Create Date: 2026-03-24

Ключи Green API в карточке организации — настройка из UI без Timeweb env.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "y6q7r8s9t03"
down_revision: Union[str, None] = "x5p6q7r8s92"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("organizations") as batch_op:
        batch_op.add_column(sa.Column("green_api_url", sa.String(length=255), nullable=True))
        batch_op.add_column(
            sa.Column("green_api_id_instance", sa.String(length=64), nullable=True)
        )
        batch_op.add_column(
            sa.Column("green_api_token_instance", sa.String(length=255), nullable=True)
        )


def downgrade() -> None:
    with op.batch_alter_table("organizations") as batch_op:
        batch_op.drop_column("green_api_token_instance")
        batch_op.drop_column("green_api_id_instance")
        batch_op.drop_column("green_api_url")
