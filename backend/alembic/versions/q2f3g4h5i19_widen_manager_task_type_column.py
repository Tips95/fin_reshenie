"""widen manager_tasks.task_type column for first_payment_record

Revision ID: q2f3g4h5i19
Revises: p1e2f3g4h18
Create Date: 2026-07-29

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "q2f3g4h5i19"
down_revision: Union[str, None] = "p1e2f3g4h18"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TASK_TYPE_LENGTH = 32


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute(
            f"ALTER TABLE manager_tasks ALTER COLUMN task_type TYPE VARCHAR({TASK_TYPE_LENGTH})"
        )
        return

    with op.batch_alter_table("manager_tasks") as batch_op:
        batch_op.alter_column(
            "task_type",
            existing_type=sa.String(length=15),
            type_=sa.String(length=TASK_TYPE_LENGTH),
            existing_nullable=False,
        )


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute(
            "ALTER TABLE manager_tasks ALTER COLUMN task_type TYPE VARCHAR(15)"
        )
        return

    with op.batch_alter_table("manager_tasks") as batch_op:
        batch_op.alter_column(
            "task_type",
            existing_type=sa.String(length=TASK_TYPE_LENGTH),
            type_=sa.String(length=15),
            existing_nullable=False,
        )
