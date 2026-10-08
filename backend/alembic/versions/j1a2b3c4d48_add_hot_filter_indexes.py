"""add hot filter indexes

Revision ID: j1a2b3c4d48
Revises: i0x1y2z3a47
Create Date: 2026-10-08

Additive only: CREATE INDEX IF NOT EXISTS. No column drops, no data rewrites.
"""

from typing import Sequence, Union

from alembic import op

revision: str = "j1a2b3c4d48"
down_revision: Union[str, None] = "i0x1y2z3a47"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_INDEXES = (
    ("ix_clients_status", "clients", "status"),
    ("ix_clients_engagement_stage", "clients", "engagement_stage"),
    ("ix_clients_procedure_stage", "clients", "procedure_stage"),
    ("ix_clients_contract_date", "clients", "contract_date"),
    ("ix_payment_schedule_due_date", "payment_schedule", "due_date"),
    ("ix_payment_schedule_deferred_until", "payment_schedule", "deferred_until"),
    ("ix_payments_payment_date", "payments", "payment_date"),
    ("ix_document_collections_status", "document_collections", "status"),
    ("ix_document_collections_paid_date", "document_collections", "paid_date"),
)


def upgrade() -> None:
    # IF NOT EXISTS: safe to re-run; never touches row data
    for name, table, column in _INDEXES:
        op.execute(f"CREATE INDEX IF NOT EXISTS {name} ON {table} ({column})")


def downgrade() -> None:
    for name, table, _column in reversed(_INDEXES):
        op.drop_index(name, table_name=table)
