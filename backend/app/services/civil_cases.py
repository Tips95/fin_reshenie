from __future__ import annotations

from uuid import UUID, uuid4

from fastapi import HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.orm import Session, joinedload, selectinload

from app.models.civil_case import CivilCase, CivilCaseDocument, CivilCaseMovement
from app.models.enums import AuditAction, CivilCaseDocumentKind, CivilCaseStage, OrganizationType, UserRole
from app.models.user import User
from app.schemas.civil_case import (
    CivilCaseBrief,
    CivilCaseCreate,
    CivilCaseDocumentResponse,
    CivilCaseExecutorOption,
    CivilCaseMovementCreate,
    CivilCaseMovementResponse,
    CivilCaseResponse,
    CivilCaseUpdate,
)
from app.services.audit import log_audit
from app.services.file_storage import (
    civil_case_document_key,
    delete_civil_case_files,
    delete_storage_key,
    save_bytes,
)


INTAKE_FIELDS = {"full_name", "phone", "price", "appeal_date", "subject", "assigned_executor_id"}
WORK_FIELDS = {
    "documents_prepared_at",
    "documents_note",
    "submitted_at",
    "authority_name",
    "executed_at",
    "execution_note",
}


def ensure_legal_org(user: User) -> None:
    organization = user.organization
    if organization is None or organization.organization_type != OrganizationType.BANKRUPTCY:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Гражданские дела доступны только в юридической компании",
        )


def can_create_civil_case(user: User) -> bool:
    return user.role in {UserRole.OWNER, UserRole.MANAGER}


def can_manage_intake(user: User) -> bool:
    return user.role in {UserRole.OWNER, UserRole.MANAGER}


def can_view_civil_case(user: User, case: CivilCase) -> bool:
    if user.role in {UserRole.OWNER, UserRole.MANAGER}:
        return True
    return user.role == UserRole.EXECUTOR and case.assigned_executor_id == user.id


def can_work_civil_case(user: User, case: CivilCase) -> bool:
    return can_view_civil_case(user, case)


def can_upload_document_kind(user: User, kind: CivilCaseDocumentKind) -> bool:
    if kind == CivilCaseDocumentKind.CLIENT:
        return can_manage_intake(user)
    return user.role == UserRole.EXECUTOR


def can_delete_document_kind(user: User, kind: CivilCaseDocumentKind) -> bool:
    if can_manage_intake(user):
        return True
    return user.role == UserRole.EXECUTOR and kind == CivilCaseDocumentKind.PREPARED


def _document_kind_label(kind: CivilCaseDocumentKind) -> str:
    if kind == CivilCaseDocumentKind.PREPARED:
        return "подготовленный документ"
    return "документ клиента"


def _case_load_options():
    return (
        joinedload(CivilCase.executor),
        joinedload(CivilCase.created_by),
        selectinload(CivilCase.movements).joinedload(CivilCaseMovement.created_by),
        selectinload(CivilCase.documents).joinedload(CivilCaseDocument.uploaded_by),
    )


def get_organization_civil_case(db: Session, *, case_id: UUID, user: User) -> CivilCase:
    case = db.scalar(
        select(CivilCase)
        .options(*_case_load_options())
        .execution_options(populate_existing=True)
        .where(CivilCase.id == case_id, CivilCase.organization_id == user.organization_id)
    )
    if case is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Дело не найдено")
    if not can_view_civil_case(user, case):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Нет доступа к делу")
    return case


def sync_civil_case_stage(case: CivilCase) -> None:
    if case.executed_at:
        case.stage = CivilCaseStage.COMPLETED
    elif case.submitted_at:
        case.stage = CivilCaseStage.SUBMITTED
    elif case.documents_prepared_at:
        case.stage = CivilCaseStage.DOCUMENTS
    else:
        case.stage = CivilCaseStage.INTAKE


def _get_executor(db: Session, *, organization_id: UUID, executor_id: UUID | None) -> User | None:
    if executor_id is None:
        return None
    executor = db.scalar(
        select(User).where(
            User.id == executor_id,
            User.organization_id == organization_id,
            User.role == UserRole.EXECUTOR,
            User.is_active.is_(True),
        )
    )
    if executor is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Выберите активного исполнителя",
        )
    return executor


def list_executors(db: Session, user: User) -> list[CivilCaseExecutorOption]:
    ensure_legal_org(user)
    if not can_manage_intake(user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Недостаточно прав")
    rows = db.scalars(
        select(User)
        .where(
            User.organization_id == user.organization_id,
            User.role == UserRole.EXECUTOR,
            User.is_active.is_(True),
        )
        .order_by(User.full_name)
    )
    return [CivilCaseExecutorOption(id=item.id, full_name=item.full_name) for item in rows]


def list_civil_cases(
    db: Session,
    user: User,
    *,
    search: str | None = None,
    stage: CivilCaseStage | None = None,
) -> list[CivilCase]:
    ensure_legal_org(user)
    stmt = (
        select(CivilCase)
        .options(
            joinedload(CivilCase.executor),
            joinedload(CivilCase.created_by),
            selectinload(CivilCase.documents),
        )
        .where(CivilCase.organization_id == user.organization_id)
        .order_by(CivilCase.appeal_date.desc(), CivilCase.created_at.desc())
    )
    if user.role == UserRole.EXECUTOR:
        stmt = stmt.where(CivilCase.assigned_executor_id == user.id)
    if stage is not None:
        stmt = stmt.where(CivilCase.stage == stage)
    if search:
        term = f"%{search.strip()}%"
        stmt = stmt.where(
            or_(CivilCase.full_name.ilike(term), CivilCase.phone.ilike(term))
        )
    return list(db.scalars(stmt).unique())


def create_civil_case(db: Session, user: User, payload: CivilCaseCreate) -> CivilCase:
    ensure_legal_org(user)
    if not can_create_civil_case(user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Дело заводит менеджер")

    executor = _get_executor(
        db,
        organization_id=user.organization_id,
        executor_id=payload.assigned_executor_id,
    )
    case = CivilCase(
        organization_id=user.organization_id,
        created_by_id=user.id,
        assigned_executor_id=executor.id if executor else None,
        full_name=payload.full_name,
        phone=payload.phone,
        price=payload.price,
        appeal_date=payload.appeal_date,
        subject=payload.subject,
        stage=CivilCaseStage.INTAKE,
    )
    db.add(case)
    db.flush()
    log_audit(
        db,
        user=user,
        entity_type="civil_case",
        entity_id=case.id,
        action=AuditAction.CREATE,
        field_name="full_name",
        new_value=case.full_name,
    )
    db.commit()
    return get_organization_civil_case(db, case_id=case.id, user=user)


def update_civil_case(db: Session, user: User, case_id: UUID, payload: CivilCaseUpdate) -> CivilCase:
    ensure_legal_org(user)
    case = get_organization_civil_case(db, case_id=case_id, user=user)
    if not can_work_civil_case(user, case):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Нет доступа к делу")

    updates = payload.model_dump(exclude_unset=True)
    if not can_manage_intake(user) and INTAKE_FIELDS.intersection(updates):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="ФИО, телефон, цену, дату, предмет и исполнителя меняет менеджер",
        )
    if not can_work_civil_case(user, case) and WORK_FIELDS.intersection(updates):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Недостаточно прав")

    if "assigned_executor_id" in updates:
        executor = _get_executor(
            db,
            organization_id=user.organization_id,
            executor_id=updates["assigned_executor_id"],
        )
        updates["assigned_executor_id"] = executor.id if executor else None

    for field, value in updates.items():
        old_value = getattr(case, field)
        if old_value != value:
            log_audit(
                db,
                user=user,
                entity_type="civil_case",
                entity_id=case.id,
                action=AuditAction.UPDATE,
                field_name=field,
                old_value=old_value,
                new_value=value,
            )
            setattr(case, field, value)

    sync_civil_case_stage(case)
    db.commit()
    return get_organization_civil_case(db, case_id=case.id, user=user)


def add_movement(
    db: Session,
    user: User,
    case_id: UUID,
    payload: CivilCaseMovementCreate,
) -> CivilCase:
    ensure_legal_org(user)
    case = get_organization_civil_case(db, case_id=case_id, user=user)
    if not can_work_civil_case(user, case):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Нет доступа к делу")

    movement = CivilCaseMovement(
        civil_case_id=case.id,
        created_by_id=user.id,
        body=payload.body,
    )
    db.add(movement)
    db.flush()
    log_audit(
        db,
        user=user,
        entity_type="civil_case",
        entity_id=case.id,
        action=AuditAction.CREATE,
        field_name="movement",
        new_value=payload.body[:255],
    )
    db.commit()
    return get_organization_civil_case(db, case_id=case.id, user=user)


def add_document(
    db: Session,
    user: User,
    case_id: UUID,
    *,
    kind: CivilCaseDocumentKind,
    content: bytes,
    filename: str,
    content_type: str,
) -> CivilCase:
    ensure_legal_org(user)
    case = get_organization_civil_case(db, case_id=case_id, user=user)
    if not can_work_civil_case(user, case):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Нет доступа к делу")
    if not can_upload_document_kind(user, kind):
        if kind == CivilCaseDocumentKind.CLIENT:
            detail = "Документы клиента загружает менеджер"
        else:
            detail = "Подготовленные документы загружает исполнитель"
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=detail)

    document_id = uuid4()
    storage_key = civil_case_document_key(user.organization_id, case.id, document_id, filename)
    save_bytes(storage_key, content)
    document = CivilCaseDocument(
        id=document_id,
        civil_case_id=case.id,
        organization_id=user.organization_id,
        uploaded_by_id=user.id,
        filename=filename,
        content_type=content_type,
        storage_key=storage_key,
        size_bytes=len(content),
        kind=kind,
    )
    db.add(document)
    db.flush()
    log_audit(
        db,
        user=user,
        entity_type="civil_case",
        entity_id=case.id,
        action=AuditAction.CREATE,
        field_name="document",
        new_value=f"{_document_kind_label(kind)}: {filename}",
    )
    db.commit()
    return get_organization_civil_case(db, case_id=case.id, user=user)


def get_case_document(db: Session, user: User, case_id: UUID, document_id: UUID) -> CivilCaseDocument:
    case = get_organization_civil_case(db, case_id=case_id, user=user)
    document = next((item for item in case.documents if item.id == document_id), None)
    if document is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Документ не найден")
    return document


def delete_document(db: Session, user: User, case_id: UUID, document_id: UUID) -> CivilCase:
    ensure_legal_org(user)
    case = get_organization_civil_case(db, case_id=case_id, user=user)
    if not can_work_civil_case(user, case):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Нет доступа к делу")
    document = next((item for item in case.documents if item.id == document_id), None)
    if document is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Документ не найден")
    if not can_delete_document_kind(user, document.kind):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Документы клиента удаляет менеджер",
        )
    filename = document.filename
    delete_storage_key(document.storage_key)
    db.delete(document)
    log_audit(
        db,
        user=user,
        entity_type="civil_case",
        entity_id=case.id,
        action=AuditAction.DELETE,
        field_name="document",
        old_value=filename,
    )
    db.commit()
    return get_organization_civil_case(db, case_id=case.id, user=user)


def delete_civil_case(db: Session, user: User, case_id: UUID) -> None:
    ensure_legal_org(user)
    if not can_manage_intake(user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Недостаточно прав")
    case = get_organization_civil_case(db, case_id=case_id, user=user)
    log_audit(
        db,
        user=user,
        entity_type="civil_case",
        entity_id=case.id,
        action=AuditAction.DELETE,
        field_name="full_name",
        old_value=case.full_name,
    )
    delete_civil_case_files(user.organization_id, case.id)
    db.delete(case)
    db.commit()


def _movement_response(item: CivilCaseMovement) -> CivilCaseMovementResponse:
    return CivilCaseMovementResponse(
        id=item.id,
        body=item.body,
        created_by_id=item.created_by_id,
        created_by_name=item.created_by.full_name if item.created_by else None,
        created_at=item.created_at,
    )


def _document_counts(case: CivilCase) -> tuple[int, int, int]:
    documents = case.documents or []
    client_count = sum(1 for item in documents if item.kind == CivilCaseDocumentKind.CLIENT)
    prepared_count = sum(1 for item in documents if item.kind == CivilCaseDocumentKind.PREPARED)
    return len(documents), client_count, prepared_count


def _document_response(item: CivilCaseDocument) -> CivilCaseDocumentResponse:
    return CivilCaseDocumentResponse(
        id=item.id,
        kind=item.kind,
        filename=item.filename,
        content_type=item.content_type,
        size_bytes=item.size_bytes,
        uploaded_by_id=item.uploaded_by_id,
        uploaded_by_name=item.uploaded_by.full_name if item.uploaded_by else None,
        created_at=item.created_at,
    )


def to_civil_case_brief(case: CivilCase) -> CivilCaseBrief:
    documents_count, client_documents_count, prepared_documents_count = _document_counts(case)
    return CivilCaseBrief(
        id=case.id,
        full_name=case.full_name,
        phone=case.phone,
        price=case.price,
        appeal_date=case.appeal_date,
        subject=case.subject,
        stage=case.stage,
        assigned_executor_id=case.assigned_executor_id,
        assigned_executor_name=case.executor.full_name if case.executor else None,
        created_by_id=case.created_by_id,
        created_by_name=case.created_by.full_name if case.created_by else None,
        documents_prepared_at=case.documents_prepared_at,
        submitted_at=case.submitted_at,
        executed_at=case.executed_at,
        documents_count=documents_count,
        client_documents_count=client_documents_count,
        prepared_documents_count=prepared_documents_count,
        created_at=case.created_at,
        updated_at=case.updated_at,
    )


def to_civil_case_response(case: CivilCase) -> CivilCaseResponse:
    brief = to_civil_case_brief(case)
    return CivilCaseResponse(
        **brief.model_dump(),
        documents_note=case.documents_note,
        authority_name=case.authority_name,
        execution_note=case.execution_note,
        movements=[_movement_response(item) for item in case.movements],
        documents=[_document_response(item) for item in case.documents],
    )
