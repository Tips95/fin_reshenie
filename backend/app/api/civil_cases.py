from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.api.deps import require_civil_staff
from app.core.database import get_db
from app.models.enums import CivilCaseDocumentKind, CivilCaseStage
from app.models.user import User
from app.schemas.civil_case import (
    CivilCaseBrief,
    CivilCaseCreate,
    CivilCaseExecutorOption,
    CivilCaseMovementCreate,
    CivilCaseResponse,
    CivilCaseUpdate,
)
from app.services.civil_cases import (
    add_document,
    add_movement,
    create_civil_case,
    delete_civil_case,
    delete_document,
    ensure_legal_org,
    get_case_document,
    get_organization_civil_case,
    list_civil_cases,
    list_executors,
    list_managers,
    to_civil_case_brief,
    to_civil_case_response,
    update_civil_case,
)
from app.services.file_storage import (
    attachment_content_disposition,
    read_and_validate_document,
    resolve_storage_path,
)

router = APIRouter()


def _require_civil_staff(
    current_user: User = Depends(require_civil_staff),
) -> User:
    ensure_legal_org(current_user)
    return current_user


@router.get("/executors", response_model=list[CivilCaseExecutorOption])
def get_executors(
    current_user: User = Depends(_require_civil_staff),
    db: Session = Depends(get_db),
) -> list[CivilCaseExecutorOption]:
    return list_executors(db, current_user)


@router.get("/managers", response_model=list[CivilCaseExecutorOption])
def get_managers(
    current_user: User = Depends(_require_civil_staff),
    db: Session = Depends(get_db),
) -> list[CivilCaseExecutorOption]:
    return list_managers(db, current_user)


@router.get("", response_model=list[CivilCaseBrief])
def get_civil_cases(
    search: str | None = Query(default=None, min_length=2),
    stage: CivilCaseStage | None = Query(default=None),
    current_user: User = Depends(_require_civil_staff),
    db: Session = Depends(get_db),
) -> list[CivilCaseBrief]:
    items = list_civil_cases(db, current_user, search=search, stage=stage)
    return [to_civil_case_brief(item) for item in items]


@router.post("", response_model=CivilCaseResponse, status_code=status.HTTP_201_CREATED)
def post_civil_case(
    payload: CivilCaseCreate,
    current_user: User = Depends(_require_civil_staff),
    db: Session = Depends(get_db),
) -> CivilCaseResponse:
    item = create_civil_case(db, current_user, payload)
    return to_civil_case_response(item)


@router.get("/{case_id}", response_model=CivilCaseResponse)
def get_civil_case(
    case_id: UUID,
    current_user: User = Depends(_require_civil_staff),
    db: Session = Depends(get_db),
) -> CivilCaseResponse:
    item = get_organization_civil_case(db, case_id=case_id, user=current_user)
    return to_civil_case_response(item)


@router.patch("/{case_id}", response_model=CivilCaseResponse)
def patch_civil_case(
    case_id: UUID,
    payload: CivilCaseUpdate,
    current_user: User = Depends(_require_civil_staff),
    db: Session = Depends(get_db),
) -> CivilCaseResponse:
    item = update_civil_case(db, current_user, case_id, payload)
    return to_civil_case_response(item)


@router.delete("/{case_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_civil_case(
    case_id: UUID,
    current_user: User = Depends(_require_civil_staff),
    db: Session = Depends(get_db),
) -> None:
    delete_civil_case(db, current_user, case_id)


@router.post("/{case_id}/movements", response_model=CivilCaseResponse)
def post_movement(
    case_id: UUID,
    payload: CivilCaseMovementCreate,
    current_user: User = Depends(_require_civil_staff),
    db: Session = Depends(get_db),
) -> CivilCaseResponse:
    item = add_movement(db, current_user, case_id, payload)
    return to_civil_case_response(item)


@router.post("/{case_id}/documents", response_model=CivilCaseResponse)
async def post_document(
    case_id: UUID,
    kind: CivilCaseDocumentKind = Query(...),
    file: UploadFile = File(...),
    current_user: User = Depends(_require_civil_staff),
    db: Session = Depends(get_db),
) -> CivilCaseResponse:
    content, filename, content_type = await read_and_validate_document(file)
    item = add_document(
        db,
        current_user,
        case_id,
        kind=kind,
        content=content,
        filename=filename,
        content_type=content_type,
    )
    return to_civil_case_response(item)


@router.get("/{case_id}/documents/{document_id}")
def download_document(
    case_id: UUID,
    document_id: UUID,
    current_user: User = Depends(_require_civil_staff),
    db: Session = Depends(get_db),
) -> FileResponse:
    document = get_case_document(db, current_user, case_id, document_id)
    path = resolve_storage_path(document.storage_key)
    if not path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Файл не найден")
    return FileResponse(
        path,
        media_type=document.content_type or "application/octet-stream",
        headers={"Content-Disposition": attachment_content_disposition(document.filename)},
    )


@router.delete("/{case_id}/documents/{document_id}", response_model=CivilCaseResponse)
def remove_document(
    case_id: UUID,
    document_id: UUID,
    current_user: User = Depends(_require_civil_staff),
    db: Session = Depends(get_db),
) -> CivilCaseResponse:
    item = delete_document(db, current_user, case_id, document_id)
    return to_civil_case_response(item)
