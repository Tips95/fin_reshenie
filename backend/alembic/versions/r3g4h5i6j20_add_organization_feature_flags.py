"""add organization feature flags for SaaS modules

Revision ID: r3g4h5i6j20
Revises: q2f3g4h5i19
Create Date: 2026-07-31

Аддитивная миграция: клиенты и платежи не трогаются. У существующих компаний
все флаги включаются (как сейчас), новые компании тоже стартуют с полным
набором — руководитель выключает ненужное в «Настройках».
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "r3g4h5i6j20"
down_revision: Union[str, None] = "q2f3g4h5i19"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

FLAGS = (
    "feature_document_collection",
    "feature_tasks",
    "feature_expenses",
    "feature_pricing",
    "feature_analytics",
    "feature_investors",
)


def upgrade() -> None:
    with op.batch_alter_table("organizations") as batch_op:
        for name in FLAGS:
            batch_op.add_column(
                sa.Column(name, sa.Boolean(), nullable=False, server_default=sa.true())
            )


def downgrade() -> None:
    with op.batch_alter_table("organizations") as batch_op:
        for name in FLAGS:
            batch_op.drop_column(name)
