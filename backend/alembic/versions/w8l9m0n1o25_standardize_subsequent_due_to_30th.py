"""standardize subsequent schedule due dates to the 30th

Revision ID: w8l9m0n1o25
Revises: v7k8l9m0n24
Create Date: 2026-08-24

В договорах 2-й и последующие платежи — до 30-го числа месяца графика.
Первый месяц не трогаем. Месяц due_date не сдвигается, только день,
чтобы не разъехалась привязка платежей и окно просрочки.
"""

from typing import Sequence, Union

from alembic import op

revision: str = "w8l9m0n1o25"
down_revision: Union[str, None] = "v7k8l9m0n24"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE payment_schedule
        SET due_date = (
            date_trunc('month', due_date)
            + (
                LEAST(
                    30,
                    EXTRACT(
                        DAY FROM (
                            date_trunc('month', due_date) + INTERVAL '1 month - 1 day'
                        )
                    )
                )::int - 1
            ) * INTERVAL '1 day'
        )::date
        WHERE month_number >= 2
          AND EXTRACT(DAY FROM due_date) IS DISTINCT FROM
              LEAST(
                  30,
                  EXTRACT(
                      DAY FROM (
                          date_trunc('month', due_date) + INTERVAL '1 month - 1 day'
                      )
                  )
              )
        """
    )


def downgrade() -> None:
    pass
