from decimal import Decimal

from app.models.retail_contract import RetailContract
from app.services.retail_access import money


def contract_collected(contract: RetailContract) -> Decimal:
    return money(
        sum(payment.amount for payment in contract.payments if not payment.is_deleted)
    )


def contract_purchase_price(contract: RetailContract) -> Decimal:
    if contract.purchase_price is not None:
        return money(contract.purchase_price)
    return money(contract.product_price)


def contract_expected_profit(contract: RetailContract) -> Decimal:
    return money(contract.total_amount - contract_purchase_price(contract))


def contract_collected_profit(contract: RetailContract, collected: Decimal | None = None) -> Decimal:
    paid = collected if collected is not None else contract_collected(contract)
    if contract.total_amount <= Decimal("0.00"):
        return Decimal("0.00")
    purchase = contract_purchase_price(contract)
    cost_share = money(purchase * (paid / contract.total_amount))
    return money(paid - cost_share)


def aggregate_contract_finances(contracts: list[RetailContract]) -> dict[str, Decimal]:
    zero = Decimal("0.00")
    purchase_total = zero
    revenue_total = zero
    collected_total = zero
    expected_profit = zero
    collected_profit = zero

    for contract in contracts:
        purchase = contract_purchase_price(contract)
        collected = contract_collected(contract)
        purchase_total += purchase
        revenue_total += contract.total_amount
        collected_total += collected
        expected_profit += contract_expected_profit(contract)
        collected_profit += contract_collected_profit(contract, collected)

    return {
        "purchase_total": money(purchase_total),
        "revenue_total": money(revenue_total),
        "collected_total": money(collected_total),
        "expected_profit": money(expected_profit),
        "collected_profit": money(collected_profit),
        "remainder_total": money(revenue_total - collected_total),
    }
