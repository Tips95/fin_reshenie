"""add users.deleted_at

Revision ID: t1k2l3m4n78
Revises: s0j1k2l3m67
Create Date: 2026-11-13

Удаление сотрудника: запись остаётся для истории, но скрыта из списков и без входа.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "t1k2l3m4n78"
down_revision: Union[str, None] = "s0j1k2l3m67"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("users") as batch:
        batch.add_column(sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("users") as batch:
        batch.drop_column("deleted_at")
