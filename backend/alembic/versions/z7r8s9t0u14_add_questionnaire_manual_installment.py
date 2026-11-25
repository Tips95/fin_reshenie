"""add questionnaire manual installment fields

Revision ID: z7r8s9t0u14
Revises: y6q7r8s9t03
Create Date: 2026-03-25

Режим рассрочки в анкете: auto (по прайсу) или manual (свой график).
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "z7r8s9t0u14"
down_revision: Union[str, None] = "y6q7r8s9t03"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    empty_json = (
        sa.text("'[]'::json") if bind.dialect.name == "postgresql" else sa.text("'[]'")
    )
    with op.batch_alter_table("client_questionnaires") as batch_op:
        batch_op.add_column(
            sa.Column(
                "installment_mode",
                sa.String(length=16),
                nullable=False,
                server_default="auto",
            )
        )
        batch_op.add_column(
            sa.Column(
                "installment_schedule",
                sa.JSON(),
                nullable=False,
                server_default=empty_json,
            )
        )


def downgrade() -> None:
    with op.batch_alter_table("client_questionnaires") as batch_op:
        batch_op.drop_column("installment_schedule")
        batch_op.drop_column("installment_mode")
