"""Удаление и пересчёт записей обязательных платежей."""

from datetime import date
from decimal import Decimal
from uuid import uuid4

from app.models.enums import MandatoryPaymentStatus
from app.services.mandatory_payments import (
    apply_mandatory_payment,
    delete_mandatory_payment_record,
    recalculate_mandatory_payment_from_records,
    update_mandatory_payment_record,
    update_mandatory_payment_record_date,
)


class FakeRecord:
    def __init__(self, amount: str, payment_date: date):
        self.id = uuid4()
        self.amount = Decimal(amount)
        self.payment_date = payment_date
        self.created_at = payment_date


class FakeMandatoryPayment:
    def __init__(self):
        self.id = uuid4()
        self.planned_amount = Decimal("25000.00")
        self.paid_amount = Decimal("0.00")
        self.paid_date = None
        self.status = MandatoryPaymentStatus.PENDING
        self.is_applicable = True
        self.payment_records = []


class FakeSession:
    def __init__(self, item: FakeMandatoryPayment):
        self.item = item

    def add(self, record):
        self.item.payment_records.append(record)

    def delete(self, record):
        self.item.payment_records = [
            entry for entry in self.item.payment_records if entry.id != record.id
        ]

    def flush(self):
        return None


class TestMandatoryPaymentRecords:
    def test_delete_record_recalculates_totals(self):
        item = FakeMandatoryPayment()
        first = FakeRecord("10000.00", date(2024, 3, 10))
        second = FakeRecord("5000.00", date(2024, 4, 15))
        item.payment_records = [first, second]
        item.paid_amount = Decimal("15000.00")
        item.status = MandatoryPaymentStatus.PARTIAL

        delete_mandatory_payment_record(FakeSession(item), item, first.id)

        assert item.paid_amount == Decimal("5000.00")
        assert item.status == MandatoryPaymentStatus.PARTIAL
        assert len(item.payment_records) == 1

    def test_update_record_date_changes_profit_month(self):
        item = FakeMandatoryPayment()
        record = FakeRecord("25000.00", date(2024, 3, 10))
        item.payment_records = [record]
        item.paid_amount = Decimal("25000.00")
        item.paid_date = date(2024, 3, 10)
        item.status = MandatoryPaymentStatus.PAID

        update_mandatory_payment_record_date(item, record.id, date(2024, 4, 20))

        assert record.payment_date == date(2024, 4, 20)
        assert item.paid_date == date(2024, 4, 20)

    def test_update_record_amount_recalculates_totals(self):
        item = FakeMandatoryPayment()
        record = FakeRecord("13000.00", date(2024, 3, 10))
        item.payment_records = [record]
        item.paid_amount = Decimal("13000.00")
        item.paid_date = date(2024, 3, 10)
        item.status = MandatoryPaymentStatus.PARTIAL

        update_mandatory_payment_record(item, record.id, amount=Decimal("10000.00"))

        assert record.amount == Decimal("10000.00")
        assert item.paid_amount == Decimal("10000.00")
        assert item.status == MandatoryPaymentStatus.PARTIAL

    def test_update_record_amount_rejects_overpay(self):
        item = FakeMandatoryPayment()
        record = FakeRecord("10000.00", date(2024, 3, 10))
        item.payment_records = [record]
        item.paid_amount = Decimal("10000.00")
        item.status = MandatoryPaymentStatus.PARTIAL

        try:
            update_mandatory_payment_record(item, record.id, amount=Decimal("30000.00"))
            assert False, "expected ValueError"
        except ValueError as exc:
            assert str(exc) == "amount_exceeds_remaining"

    def test_apply_then_recalculate_keeps_status(self):
        item = FakeMandatoryPayment()
        apply_mandatory_payment(FakeSession(item), item, Decimal("25000.00"), date(2024, 5, 1))
        recalculate_mandatory_payment_from_records(item)
        assert item.paid_amount == Decimal("25000.00")
        assert item.status == MandatoryPaymentStatus.PAID
