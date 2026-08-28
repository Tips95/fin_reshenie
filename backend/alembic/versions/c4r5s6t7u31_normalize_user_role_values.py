"""normalize users.role to lowercase values

Revision ID: c4r5s6t7u31
Revises: b3q4r5s6t30
Create Date: 2026-08-28

Старые записи могли хранить имя enum (OWNER), новый код ждёт значение (owner).
LOWER безопасен: owner остаётся owner, OWNER становится owner.
"""

from typing import Sequence, Union

from alembic import op

revision: str = "c4r5s6t7u31"
down_revision: Union[str, None] = "b3q4r5s6t30"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("UPDATE users SET role = LOWER(role)")


def downgrade() -> None:
    pass
