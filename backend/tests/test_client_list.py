import uuid
from datetime import date, datetime
from decimal import Decimal
from types import SimpleNamespace

from app.models.enums import ClientStatus
from app.services.client_list import ClientSortField, SortDirection, paginate_clients, sort_clients


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


class TestPaginateClients:
    def test_returns_requested_page(self):
        clients = [
            make_client(full_name=f"Client {index}", contract_date=date(2025, 1, 1), created_at=datetime(2025, 1, index))
            for index in range(1, 6)
        ]

        page_items, total = paginate_clients(clients, page=2, page_size=2)

        assert total == 5
        assert [client.full_name for client in page_items] == ["Client 3", "Client 4"]

    def test_empty_list(self):
        page_items, total = paginate_clients([], page=1, page_size=25)

        assert page_items == []
        assert total == 0
