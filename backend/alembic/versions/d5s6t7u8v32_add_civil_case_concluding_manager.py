"""add civil case concluding manager

Revision ID: d5s6t7u8v32
Revises: c4r5s6t7u31
Create Date: 2026-08-28

Кто заключил клиента по гражданке — отдельно от created_by (кто завёл карточку).
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "d5s6t7u8v32"
down_revision: Union[str, None] = "c4r5s6t7u31"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("civil_cases") as batch_op:
        batch_op.add_column(sa.Column("concluding_manager_id", sa.Uuid(), nullable=True))
        batch_op.create_index(
            "ix_civil_cases_concluding_manager_id",
            ["concluding_manager_id"],
        )
        batch_op.create_foreign_key(
            "fk_civil_cases_concluding_manager_id_users",
            "users",
            ["concluding_manager_id"],
            ["id"],
            ondelete="SET NULL",
        )
    op.execute(
        "UPDATE civil_cases SET concluding_manager_id = created_by_id "
        "WHERE concluding_manager_id IS NULL"
    )


def downgrade() -> None:
    with op.batch_alter_table("civil_cases") as batch_op:
        batch_op.drop_constraint("fk_civil_cases_concluding_manager_id_users", type_="foreignkey")
        batch_op.drop_index("ix_civil_cases_concluding_manager_id")
        batch_op.drop_column("concluding_manager_id")
