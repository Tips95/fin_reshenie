import uuid
from datetime import date
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException

from app.models.enums import PaymentScheduleStatus
from app.models.payment_schedule import PaymentSchedule
from app.models.pricing_tier import PricingTier
from app.services.access import find_pricing_tier
from app.services.installment_schedule import (
    _month_due_date,
    apply_payment_to_schedule,
    build_payment_schedule_entries,
    create_payment_schedule_models,
    recalculate_schedule_from_payments,
)

ORG_ID = uuid.UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
PLAN_ID = uuid.UUID("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb")


def make_tier(
    *,
    min_amount: str = "100000.00",
    max_amount: str = "200000.00",
    total_cost: str = "120000.00",
    first_month: str = "24000.00",
    second_month: str = "18000.00",
    remaining_months: int = 3,
    remaining_payment: str = "26000.00",
    total_months: int = 5,
    effective_from: date = date(2025, 1, 1),
) -> PricingTier:
    return PricingTier(
        id=uuid.uuid4(),
        organization_id=ORG_ID,
        min_amount=Decimal(min_amount),
        max_amount=Decimal(max_amount),
        total_cost=Decimal(total_cost),
        first_month_payment=Decimal(first_month),
        second_month_payment=Decimal(second_month),
        remaining_months_count=remaining_months,
        remaining_month_payment=Decimal(remaining_payment),
        total_months=total_months,
        is_active=True,
        effective_from=effective_from,
    )


class TestBuildPaymentSchedule:
    def test_generates_correct_amounts_per_month(self):
        tier = make_tier()
        start_date = date(2025, 8, 15)

        entries = build_payment_schedule_entries(pricing_tier=tier, start_date=start_date)

        assert len(entries) == 5
        assert entries[0]["planned_amount"] == Decimal("24000.00")
        assert entries[1]["planned_amount"] == Decimal("18000.00")
        assert entries[2]["planned_amount"] == Decimal("26000.00")
        assert entries[3]["planned_amount"] == Decimal("26000.00")
        assert entries[4]["planned_amount"] == Decimal("26000.00")

    def test_total_equals_total_cost(self):
        tier = make_tier()
        entries = build_payment_schedule_entries(pricing_tier=tier, start_date=date(2025, 8, 1))

        total = sum((entry["planned_amount"] for entry in entries), Decimal("0.00"))
        assert total == tier.total_cost

    def test_due_dates_increment_monthly_from_start_date(self):
        tier = make_tier(total_months=4, remaining_months=2, remaining_payment="10000.00",
                         first_month="10000.00", second_month="10000.00", total_cost="40000.00")
        start_date = date(2025, 8, 15)

        entries = build_payment_schedule_entries(pricing_tier=tier, start_date=start_date)

        assert entries[0]["due_date"] == date(2025, 8, 15)
        assert entries[1]["due_date"] == date(2025, 9, 15)
        assert entries[2]["due_date"] == date(2025, 10, 15)
        assert entries[3]["due_date"] == date(2025, 11, 15)

    def test_month_due_date_handles_month_end(self):
        assert _month_due_date(date(2025, 1, 31), 2) == date(2025, 2, 28)
        assert _month_due_date(date(2024, 1, 31), 2) == date(2024, 2, 29)

    def test_initial_status_pending_with_zero_paid(self):
        tier = make_tier()
        entries = build_payment_schedule_entries(pricing_tier=tier, start_date=date(2025, 8, 1))

        for entry in entries:
            assert entry["status"] == PaymentScheduleStatus.PENDING
            assert entry["paid_amount"] == Decimal("0.00")
            assert entry["month_number"] >= 1

    def test_rejects_when_month_count_mismatch(self):
        tier = make_tier(total_months=99)

        with pytest.raises(HTTPException) as exc:
            build_payment_schedule_entries(pricing_tier=tier, start_date=date(2025, 8, 1))

        assert exc.value.status_code == 422
        assert "месяцев" in exc.value.detail

    def test_rejects_when_total_cost_mismatch(self):
        tier = make_tier(total_cost="999999.00")

        with pytest.raises(HTTPException) as exc:
            build_payment_schedule_entries(pricing_tier=tier, start_date=date(2025, 8, 1))

        assert exc.value.status_code == 422
        assert "total_cost" in exc.value.detail

    def test_realistic_reshenie_tariff_example(self):
        """Типичный тариф: 10 месяцев, фиксированные суммы по диапазону."""
        tier = make_tier(
            min_amount="100000.00",
            max_amount="250000.00",
            total_cost="130000.00",
            first_month="26000.00",
            second_month="20000.00",
            remaining_months=8,
            remaining_payment="10500.00",
            total_months=10,
        )
        start_date = date(2025, 8, 1)

        entries = build_payment_schedule_entries(pricing_tier=tier, start_date=start_date)
        total = sum((entry["planned_amount"] for entry in entries), Decimal("0.00"))

        assert len(entries) == 10
        assert entries[0]["planned_amount"] == Decimal("26000.00")
        assert entries[1]["planned_amount"] == Decimal("20000.00")
        assert all(entry["planned_amount"] == Decimal("10500.00") for entry in entries[2:])
        assert total == Decimal("130000.00")
        assert entries[-1]["due_date"] == date(2026, 5, 1)


class TestCreatePaymentScheduleModels:
    def test_creates_payment_schedule_models(self):
        tier = make_tier(total_months=3, remaining_months=1, remaining_payment="10000.00",
                         first_month="10000.00", second_month="10000.00", total_cost="30000.00")

        schedules = create_payment_schedule_models(
            pricing_tier=tier,
            start_date=date(2025, 8, 1),
            installment_plan_id=PLAN_ID,
        )

        assert len(schedules) == 3
        assert all(isinstance(item, PaymentSchedule) for item in schedules)
        assert all(item.installment_plan_id == PLAN_ID for item in schedules)
        assert [item.month_number for item in schedules] == [1, 2, 3]


class TestApplyPaymentToSchedule:
    def _schedule(self, planned: str = "10000.00", paid: str = "0.00") -> PaymentSchedule:
        return PaymentSchedule(
            installment_plan_id=PLAN_ID,
            month_number=1,
            due_date=date(2025, 8, 1),
            planned_amount=Decimal(planned),
            paid_amount=Decimal(paid),
            status=PaymentScheduleStatus.PENDING,
        )

    def test_full_payment_sets_paid_status(self):
        schedule = self._schedule()
        apply_payment_to_schedule(schedule, Decimal("10000.00"), date(2025, 8, 5))

        assert schedule.status == PaymentScheduleStatus.PAID
        assert schedule.paid_amount == Decimal("10000.00")
        assert schedule.paid_date == date(2025, 8, 5)

    def test_partial_payment_sets_partial_status(self):
        schedule = self._schedule()
        apply_payment_to_schedule(schedule, Decimal("4000.00"), date(2025, 8, 5))

        assert schedule.status == PaymentScheduleStatus.PARTIAL
        assert schedule.paid_amount == Decimal("4000.00")
        assert schedule.paid_date is None

    def test_overpayment_capped_at_planned_amount(self):
        schedule = self._schedule()
        apply_payment_to_schedule(schedule, Decimal("15000.00"), date(2025, 8, 5))

        assert schedule.status == PaymentScheduleStatus.PAID
        assert schedule.paid_amount == Decimal("10000.00")


class TestRecalculateScheduleFromPayments:
    def _schedule(self, planned: str = "10000.00") -> PaymentSchedule:
        return PaymentSchedule(
            installment_plan_id=PLAN_ID,
            month_number=1,
            due_date=date(2025, 8, 1),
            planned_amount=Decimal(planned),
            paid_amount=Decimal("0.00"),
            status=PaymentScheduleStatus.PENDING,
        )

    def _payment(self, amount: str, payment_date: date, *, is_refund: bool = False):
        return SimpleNamespace(
            amount=Decimal(amount),
            payment_date=payment_date,
            created_at=payment_date,
            is_refund=is_refund,
        )

    def test_recalculate_after_delete_payment(self):
        schedule = self._schedule()
        payments = [self._payment("10000.00", date(2025, 8, 5))]

        recalculate_schedule_from_payments(schedule, payments)

        assert schedule.status == PaymentScheduleStatus.PAID
        assert schedule.paid_amount == Decimal("10000.00")

        recalculate_schedule_from_payments(schedule, [])

        assert schedule.status == PaymentScheduleStatus.PENDING
        assert schedule.paid_amount == Decimal("0.00")
        assert schedule.paid_date is None

    def test_recalculate_partial_then_refund(self):
        schedule = self._schedule()
        payments = [
            self._payment("6000.00", date(2025, 8, 5)),
            self._payment("2000.00", date(2025, 8, 10), is_refund=True),
        ]

        recalculate_schedule_from_payments(schedule, payments)

        assert schedule.status == PaymentScheduleStatus.PARTIAL
        assert schedule.paid_amount == Decimal("4000.00")

    def test_recalculate_refund_cannot_go_below_zero(self):
        schedule = self._schedule()
        payments = [
            self._payment("3000.00", date(2025, 8, 5)),
            self._payment("5000.00", date(2025, 8, 10), is_refund=True),
        ]

        recalculate_schedule_from_payments(schedule, payments)

        assert schedule.status == PaymentScheduleStatus.PENDING
        assert schedule.paid_amount == Decimal("0.00")


class TestFindPricingTier:
    def test_returns_matching_active_tier(self):
        tier = make_tier(min_amount="100000.00", max_amount="200000.00", effective_from=date(2025, 1, 1))
        db = MagicMock()
        db.scalar.return_value = tier

        result = find_pricing_tier(
            db,
            organization_id=ORG_ID,
            debt_amount=Decimal("150000.00"),
            contract_date=date(2025, 8, 1),
        )

        assert result is tier
        db.scalar.assert_called_once()

    def test_returns_none_when_no_tier_found(self):
        db = MagicMock()
        db.scalar.side_effect = [None, 1, None]

        result = find_pricing_tier(
            db,
            organization_id=ORG_ID,
            debt_amount=Decimal("50000.00"),
            contract_date=date(2025, 8, 1),
        )

        assert result is None

    def test_boundary_400k_uses_lower_tier(self):
        """Ровно 400 000 ₽ — диапазон 300–400к (150к), а не 400–500к (160к)."""
        tier_300_400 = make_tier(
            min_amount="300000.00",
            max_amount="400000.00",
            total_cost="150000.00",
            effective_from=date(2025, 1, 1),
        )
        db = MagicMock()
        db.scalar.return_value = tier_300_400

        result = find_pricing_tier(
            db,
            organization_id=ORG_ID,
            debt_amount=Decimal("400000.00"),
            contract_date=date(2026, 7, 15),
        )

        assert result is tier_300_400
        assert result.total_cost == Decimal("150000.00")

    def test_accepts_simple_namespace_tier_for_schedule_build(self):
        """Генерация работает с любым объектом с нужными полями (как в валидации API)."""
        tier = SimpleNamespace(
            first_month_payment=Decimal("10000.00"),
            second_month_payment=Decimal("10000.00"),
            remaining_months_count=1,
            remaining_month_payment=Decimal("10000.00"),
            total_months=3,
            total_cost=Decimal("30000.00"),
        )
        entries = build_payment_schedule_entries(pricing_tier=tier, start_date=date(2025, 8, 1))
        assert len(entries) == 3
