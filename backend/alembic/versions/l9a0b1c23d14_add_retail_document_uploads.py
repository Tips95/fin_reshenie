"""add retail document upload fields

Revision ID: l9a0b1c23d14
Revises: k8f9a0b12c13
Create Date: 2026-07-24

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "l9a0b1c23d14"
down_revision: Union[str, None] = "k8f9a0b12c13"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("retail_clients", sa.Column("passport_pdf_path", sa.String(length=512), nullable=True))
    op.add_column(
        "retail_clients",
        sa.Column("passport_pdf_filename", sa.String(length=255), nullable=True),
    )
    op.add_column(
        "retail_contracts",
        sa.Column("signed_contract_pdf_path", sa.String(length=512), nullable=True),
    )
    op.add_column(
        "retail_contracts",
        sa.Column("signed_contract_pdf_filename", sa.String(length=255), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("retail_contracts", "signed_contract_pdf_filename")
    op.drop_column("retail_contracts", "signed_contract_pdf_path")
    op.drop_column("retail_clients", "passport_pdf_filename")
    op.drop_column("retail_clients", "passport_pdf_path")
