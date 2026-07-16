import uuid
from datetime import date, datetime
from decimal import Decimal
from types import SimpleNamespace

from app.models.enums import ClientStatus
from app.services.client_list import ClientSortField, SortDirection, sort_clients


def make_client(
    *,
    full_name: str,
    contract_date: date,
    debt_amount: str = "300000.00",
    status: ClientStatus = ClientStatus.ACTIVE,
    created_at: datetime,
) -> SimpleNamespace:
    return SimpleNamespace(
        id=uuid.uuid4(),
        full_name=full_name,
        contract_date=contract_date,
        debt_amount=Decimal(debt_amount),
        status=status,
        created_at=created_at,
    )


class TestClientSorting:
    def test_sort_by_full_name_asc(self):
        clients = [
            make_client(full_name="Яковлев", contract_date=date(2025, 1, 1), created_at=datetime(2025, 1, 1)),
            make_client(full_name="Антонов", contract_date=date(2025, 2, 1), created_at=datetime(2025, 2, 1)),
        ]

        sorted_clients = sort_clients(
            None,
            clients,
            sort_by=ClientSortField.FULL_NAME,
            sort_dir=SortDirection.ASC,
        )

        assert [client.full_name for client in sorted_clients] == ["Антонов", "Яковлев"]

    def test_sort_by_debt_amount_desc(self):
        clients = [
            make_client(
                full_name="A",
                contract_date=date(2025, 1, 1),
                debt_amount="350000.00",
                created_at=datetime(2025, 1, 1),
            ),
            make_client(
                full_name="B",
                contract_date=date(2025, 1, 2),
                debt_amount="500000.00",
                created_at=datetime(2025, 1, 2),
            ),
        ]

        sorted_clients = sort_clients(
            None,
            clients,
            sort_by=ClientSortField.DEBT_AMOUNT,
            sort_dir=SortDirection.DESC,
        )

        assert [client.full_name for client in sorted_clients] == ["B", "A"]
