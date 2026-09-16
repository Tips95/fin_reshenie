"""add lead appointment booking

Revision ID: g8v9w0x1y45
Revises: f7u8v9w0x34
Create Date: 2026-09-16

Клиент говорит «подойду такого-то числа» — дата приёма на лиде
и напоминание менеджеру в списке, отдельно от перезвона.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "g8v9w0x1y45"
down_revision: Union[str, None] = "f7u8v9w0x34"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("client_questionnaires") as batch_op:
        batch_op.add_column(sa.Column("appointment_at", sa.Date(), nullable=True))
        batch_op.add_column(sa.Column("appointment_note", sa.Text(), nullable=True))
        batch_op.create_index(
            "ix_client_questionnaires_appointment_at", ["appointment_at"]
        )


def downgrade() -> None:
    with op.batch_alter_table("client_questionnaires") as batch_op:
        batch_op.drop_index("ix_client_questionnaires_appointment_at")
        batch_op.drop_column("appointment_note")
        batch_op.drop_column("appointment_at")
