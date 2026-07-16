from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.api.clients import _build_client_detail
from app.api.deps import get_current_active_user, require_owner_or_manager
from app.core.database import get_db
from app.models.enums import ClientStatus, ProcedureStage, UserRole
from app.models.user import User
from app.services.access import ensure_client_read_access
from app.services.client_list import query_clients
from app.services.excel_export import (
    build_client_detail_workbook,
    build_clients_workbook,
    build_overdue_clients_workbook,
    workbook_to_bytes,
)

router = APIRouter()

XLSX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def _xlsx_response(content: bytes, filename: str) -> Response:
    return Response(
        content=content,
        media_type=XLSX_MEDIA_TYPE,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _export_filename(prefix: str) -> str:
    ascii_prefix = "".join(
        ch if ord(ch) < 128 and (ch.isalnum() or ch in ("-", "_")) else "_"
        for ch in prefix
    ).strip("_") or "export"
    return f"{ascii_prefix}_{date.today().isoformat()}.xlsx"


@router.get("/clients.xlsx")
def export_clients(
    status_filter: ClientStatus | None = Query(default=None, alias="status"),
    procedure_stage: ProcedureStage | None = Query(default=None),
    manager_id: UUID | None = Query(default=None),
    overdue: bool | None = Query(default=None),
    phone: str | None = Query(default=None, min_length=3),
    name: str | None = Query(default=None, min_length=2),
    contract_month: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}$"),
    due_month: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}$"),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> Response:
    if manager_id is not None and current_user.role != UserRole.OWNER:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Фильтр по менеджеру только для owner")

    clients = query_clients(
        db,
        current_user,
        status_filter=status_filter,
        procedure_stage=procedure_stage,
        manager_id=manager_id,
        overdue=overdue,
        phone=phone,
        name=name,
        contract_month=contract_month,
        due_month=due_month,
    )
    workbook = build_clients_workbook(db, current_user, clients)
    return _xlsx_response(workbook_to_bytes(workbook), _export_filename("clients"))


@router.get("/clients/{client_id}.xlsx")
def export_client_detail(
    client_id: UUID,
    current_user: User = Depends(require_owner_or_manager),
    db: Session = Depends(get_db),
) -> Response:
    client = ensure_client_read_access(db, current_user, client_id)
    detail = _build_client_detail(db, client)

    manager_name = None
    if client.assigned_manager_id:
        manager = db.get(User, client.assigned_manager_id)
        manager_name = manager.full_name if manager else None

    workbook = build_client_detail_workbook(db, detail, manager_name=manager_name)
    safe_name = "".join(
        ch if ord(ch) < 128 and (ch.isalnum() or ch in ("-", "_")) else "_"
        for ch in client.full_name[:40]
    ).strip("_") or client_id.hex[:12]
    return _xlsx_response(workbook_to_bytes(workbook), _export_filename(f"client_{safe_name}"))


@router.get("/overdue-clients.xlsx")
def export_overdue_clients(
    current_user: User = Depends(require_owner_or_manager),
    db: Session = Depends(get_db),
) -> Response:
    clients = query_clients(db, current_user, overdue=True)
    workbook = build_overdue_clients_workbook(db, clients)
    return _xlsx_response(workbook_to_bytes(workbook), _export_filename("overdue_clients"))
