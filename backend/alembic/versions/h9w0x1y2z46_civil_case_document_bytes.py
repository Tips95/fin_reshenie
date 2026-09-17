"""store civil case document bytes in database

Revision ID: h9w0x1y2z46
Revises: g8v9w0x1y45
Create Date: 2026-09-17

Timeweb запрещает volumes — локальный uploads/ пропадает при редеплое.
Держим байты документа в Postgres, чтобы скачивание работало стабильно.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "h9w0x1y2z46"
down_revision: Union[str, None] = "g8v9w0x1y45"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("civil_case_documents") as batch_op:
        batch_op.add_column(sa.Column("file_data", sa.LargeBinary(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("civil_case_documents") as batch_op:
        batch_op.drop_column("file_data")
