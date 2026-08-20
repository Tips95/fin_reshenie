"""add free-text property and weapon fields to questionnaires

Revision ID: v7k8l9m0n24
Revises: u6j7k8l9m23
Create Date: 2026-08-20

Аддитивно: колонки имущества и оружия. Таблицы клиентов не меняются.
Старые JSON assets/documents остаются в БД, форма их больше не заполняет.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "v7k8l9m0n24"
down_revision: Union[str, None] = "u6j7k8l9m23"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("client_questionnaires", sa.Column("property_debtor", sa.Text(), nullable=True))
    op.add_column("client_questionnaires", sa.Column("property_spouse", sa.Text(), nullable=True))
    op.add_column("client_questionnaires", sa.Column("has_weapon", sa.Boolean(), nullable=True))
    op.add_column("client_questionnaires", sa.Column("weapon_details", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("client_questionnaires", "weapon_details")
    op.drop_column("client_questionnaires", "has_weapon")
    op.drop_column("client_questionnaires", "property_spouse")
    op.drop_column("client_questionnaires", "property_debtor")
