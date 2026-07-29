"""add first_payment_record task type

Revision ID: p1e2f3g4h18
Revises: o0d1e2f3g17
Create Date: 2026-07-29

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "p1e2f3g4h18"
down_revision: Union[str, None] = "o0d1e2f3g17"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

OLD_TASK_TYPES = ("overdue_payment", "deferral_review", "manual")
NEW_TASK_TYPES = ("overdue_payment", "first_payment_record", "deferral_review", "manual")


def _task_type_enum(values: tuple[str, ...]) -> sa.Enum:
    return sa.Enum(*values, name="tasktype", native_enum=False)


def _upgrade_postgresql() -> None:
    bind = op.get_bind()
    is_native_enum = bind.execute(
        sa.text("SELECT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tasktype')")
    ).scalar()
    if is_native_enum:
        op.execute("ALTER TYPE tasktype ADD VALUE IF NOT EXISTS 'first_payment_record'")
        return

    op.execute(
        """
        DO $$
        DECLARE
            constraint_name text;
        BEGIN
            FOR constraint_name IN
                SELECT con.conname
                FROM pg_constraint con
                JOIN pg_class rel ON rel.oid = con.conrelid
                JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
                WHERE rel.relname = 'manager_tasks'
                  AND att.attname = 'task_type'
                  AND con.contype = 'c'
            LOOP
                EXECUTE format('ALTER TABLE manager_tasks DROP CONSTRAINT %I', constraint_name);
            END LOOP;
        END $$;
        """
    )
    values_sql = ", ".join(f"'{value}'" for value in NEW_TASK_TYPES)
    op.execute(
        f"""
        ALTER TABLE manager_tasks
        ADD CONSTRAINT manager_tasks_task_type_check
        CHECK (task_type IN ({values_sql}))
        """
    )


def _downgrade_postgresql() -> None:
    op.execute("ALTER TABLE manager_tasks DROP CONSTRAINT IF EXISTS manager_tasks_task_type_check")
    values_sql = ", ".join(f"'{value}'" for value in OLD_TASK_TYPES)
    op.execute(
        f"""
        ALTER TABLE manager_tasks
        ADD CONSTRAINT manager_tasks_task_type_check
        CHECK (task_type IN ({values_sql}))
        """
    )


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        _upgrade_postgresql()
        return

    with op.batch_alter_table("manager_tasks") as batch_op:
        batch_op.alter_column(
            "task_type",
            existing_type=_task_type_enum(OLD_TASK_TYPES),
            type_=_task_type_enum(NEW_TASK_TYPES),
            existing_nullable=False,
        )


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        _downgrade_postgresql()
        return

    with op.batch_alter_table("manager_tasks") as batch_op:
        batch_op.alter_column(
            "task_type",
            existing_type=_task_type_enum(NEW_TASK_TYPES),
            type_=_task_type_enum(OLD_TASK_TYPES),
            existing_nullable=False,
        )
