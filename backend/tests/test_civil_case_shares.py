import uuid
from datetime import date
from decimal import Decimal
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.services.civil_case_shares import (
    apply_civil_share_collected,
    get_civil_shares_overview,
    share_lines,
)

ORG_ID = uuid.uuid4()
MANAGER_ID = uuid.uuid4()
EXECUTOR_ID = uuid.uuid4()


def _person(person_id: uuid.UUID, name: str) -> SimpleNamespace:
    return SimpleNamespace(id=person_id, full_name=name)


def _case(
    *,
    price: str = "10000.00",
    manager_id: uuid.UUID | None = MANAGER_ID,
    executor_id: uuid.UUID | None = EXECUTOR_ID,
    manager_paid: bool = False,
    executor_paid: bool = False,
    appeal: date = date(2026, 11, 3),
) -> SimpleNamespace:
    return SimpleNamespace(
        id=uuid.uuid4(),
        organization_id=ORG_ID,
        full_name="Иванов Иван",
        price=Decimal(price),
        appeal_date=appeal,
        concluding_manager_id=manager_id,
        assigned_executor_id=executor_id,
        concluding_manager=_person(manager_id, "Менеджер А") if manager_id else None,
        executor=_person(executor_id, "Исполнитель Б") if executor_id else None,
        manager_share_paid=manager_paid,
        manager_share_paid_at=None,
        executor_share_paid=executor_paid,
        executor_share_paid_at=None,
    )


def test_self_executed_case_is_forty_percent():
    case = _case(manager_id=MANAGER_ID, executor_id=MANAGER_ID)
    case.executor = case.concluding_manager
    lines = share_lines(case)
    assert len(lines) == 1
    assert lines[0].role == "both"
    assert lines[0].share_label == "40%"
    assert lines[0].amount == Decimal("4000.00")


def test_handed_off_case_splits_twenty_twenty():
    lines = share_lines(_case())
    assert [line.role for line in lines] == ["manager", "executor"]
    assert [line.amount for line in lines] == [Decimal("2000.00"), Decimal("2000.00")]


def test_unassigned_executor_keeps_only_manager_share():
    lines = share_lines(_case(executor_id=None))
    assert len(lines) == 1
    assert lines[0].role == "manager"
    assert lines[0].amount == Decimal("2000.00")


def test_zero_price_has_no_share():
    assert share_lines(_case(price="0.00")) == []


def test_marking_self_share_sets_both_flags():
    case = _case(manager_id=MANAGER_ID, executor_id=MANAGER_ID)
    case.executor = case.concluding_manager
    assert apply_civil_share_collected(case, "both", True) is True
    assert case.manager_share_paid is True
    assert case.executor_share_paid is True
    with pytest.raises(HTTPException):
        apply_civil_share_collected(case, "manager", True)


def test_overview_groups_payees_for_the_month():
    self_case = _case(manager_id=MANAGER_ID, executor_id=MANAGER_ID, appeal=date(2026, 11, 2))
    self_case.executor = self_case.concluding_manager
    self_case.full_name = "Сам сделал"
    split = _case(appeal=date(2026, 11, 8), manager_paid=True)
    split.full_name = "Перевёл"
    other_month = _case(appeal=date(2026, 10, 1))
    other_month.full_name = "Прошлый месяц"

    class _Scalars:
        def __init__(self, rows):
            self._rows = rows

        def unique(self):
            return self._rows

    db = SimpleNamespace()
    calls = {"n": 0}

    def scalars(_stmt):
        calls["n"] += 1
        if calls["n"] == 1:
            return _Scalars([self_case, split])
        return _Scalars([self_case, split, other_month])

    db.scalars = scalars
    user = SimpleNamespace(organization_id=ORG_ID)

    overview = get_civil_shares_overview(db, user, month="2026-11")

    assert overview.cases_count == 2
    assert overview.total_amount == Decimal("8000.00")
    assert overview.paid_amount == Decimal("2000.00")
    assert overview.to_pay_amount == Decimal("6000.00")
    assert overview.outstanding_to_pay_amount == Decimal("10000.00")
    by_name = {row.payee_name: row for row in overview.payees}
    assert by_name["Менеджер А"].total_amount == Decimal("6000.00")
    assert by_name["Исполнитель Б"].to_pay_amount == Decimal("2000.00")
