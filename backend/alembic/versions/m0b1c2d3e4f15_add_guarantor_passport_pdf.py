"""add guarantor passport pdf fields

Revision ID: m0b1c2d3e4f15
Revises: l9a0b1c23d14
Create Date: 2026-07-24

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "m0b1c2d3e4f15"
down_revision: Union[str, None] = "l9a0b1c23d14"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "retail_clients",
        sa.Column("guarantor_passport_pdf_path", sa.String(length=512), nullable=True),
    )
    op.add_column(
        "retail_clients",
        sa.Column("guarantor_passport_pdf_filename", sa.String(length=255), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("retail_clients", "guarantor_passport_pdf_filename")
    op.drop_column("retail_clients", "guarantor_passport_pdf_path")
