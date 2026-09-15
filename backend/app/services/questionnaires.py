from __future__ import annotations

from datetime import date, datetime, timezone
from decimal import Decimal
from uuid import UUID
from urllib.parse import quote

from fastapi import HTTPException, status
from sqlalchemy import exists, func, or_, select
from sqlalchemy.orm import Session, joinedload, selectinload

from app.core.time import local_day_bounds, local_today
from app.models.client import Client
from app.models.client_questionnaire import ClientQuestionnaire, QuestionnaireCall
from app.models.enums import (
    AuditAction,
    EngagementStage,
    LeadCallOutcome,
    LeadStatus,
    OrganizationType,
    UserRole,
)
from app.models.user import User
from app.schemas.questionnaire import (
    LeadStatsResponse,
    LeadStatsRow,
    QuestionnaireAssignRequest,
    QuestionnaireBase,
    QuestionnaireCallCreate,
    QuestionnaireCallResponse,
    QuestionnaireCreate,
    QuestionnaireCreateClientRequest,
    QuestionnaireManagerOption,
    QuestionnaireResponse,
    QuestionnaireUnqualifyRequest,
    QuestionnaireUpdate,
)
from app.services.access import ensure_client_read_access, ensure_client_write_access
from app.services.audit import log_audit
from app.services.client_duplicates import (
    INCOMPLETE_PHONE_MESSAGE,
    duplicate_client_payload,
    find_existing_client,
    phone_has_minimum_digits,
)
from app.services.document_collection import create_document_collection
from app.services.funnel import try_ensure_first_payment_task_for_manager_client
from app.services.questionnaire_defaults import empty_assets, empty_debts, empty_documents
from app.services.validation import validate_full_name, validate_phone_required


def _no_registered_marriage_history(divorce_info: str | None) -> bool:
    text = (divorce_info or "").strip().lower()
    return not text or text in {
        "нет",
        "отсутствует",
        "не состоял",
        "не состояла",
        "не был",
        "не была",
    }


def _family_logic_fields(payload: QuestionnaireBase) -> dict[str, object]:
    if payload.is_married is True:
        return {
            "divorce_info": None,
            "income_spouse": payload.income_spouse,
            "property_spouse": payload.property_spouse,
        }
    if payload.is_married is False:
        divorced = not _no_registered_marriage_history(payload.divorce_info)
        return {
            "divorce_info": payload.divorce_info,
            "income_spouse": None,
            "property_spouse": payload.property_spouse if divorced else None,
        }
    return {
        "divorce_info": payload.divorce_info,
        "income_spouse": payload.income_spouse,
        "property_spouse": payload.property_spouse,
    }


LEAD_SUPERVISOR_ROLES = {UserRole.OWNER, UserRole.HEAD_MANAGER}
LEAD_OWNER_ROLES = {UserRole.MANAGER, UserRole.HEAD_MANAGER}


def ensure_bankruptcy_org(user: User) -> None:
    organization = user.organization
    if organization is None or organization.organization_type != OrganizationType.BANKRUPTCY:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Анкеты доступны только в юридическом контуре",
        )


def manager_can_access_questionnaire(item: ClientQuestionnaire, user: User) -> bool:
    """Менеджер видит свои лиды и анкеты закреплённых за ним клиентов. Руководитель,
    начальник отдела и сотрудник сбора документов видят все анкеты организации."""
    if user.role != UserRole.MANAGER:
        return True
    if item.created_by_id == user.id or item.assigned_manager_id == user.id:
        return True
    client = item.client
    return client is not None and client.assigned_manager_id == user.id


def _apply_questionnaire_visibility_filter(stmt, user: User):
    if user.role != UserRole.MANAGER:
        return stmt
    assigned_to_manager = exists(
        select(Client.id).where(
            Client.id == ClientQuestionnaire.client_id,
            Client.assigned_manager_id == user.id,
        )
    )
    return stmt.where(
        or_(
            ClientQuestionnaire.created_by_id == user.id,
            ClientQuestionnaire.assigned_manager_id == user.id,
            assigned_to_manager,
        )
    )


def _questionnaire_load_options():
    return (
        joinedload(ClientQuestionnaire.created_by),
        joinedload(ClientQuestionnaire.assigned_manager),
        joinedload(ClientQuestionnaire.client),
        selectinload(ClientQuestionnaire.calls).joinedload(QuestionnaireCall.created_by),
    )


def get_organization_questionnaire(
    db: Session,
    *,
    questionnaire_id: UUID,
    user: User,
) -> ClientQuestionnaire:
    item = db.scalar(
        select(ClientQuestionnaire)
        .options(*_questionnaire_load_options())
        # Журнал звонков дописывается отдельными вставками, поэтому коллекцию
        # нужно перечитывать, а не брать из identity map.
        .execution_options(populate_existing=True)
        .where(
            ClientQuestionnaire.id == questionnaire_id,
            ClientQuestionnaire.organization_id == user.organization_id,
        )
    )
    if item is None or not manager_can_access_questionnaire(item, user):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Анкета не найдена")
    return item


def list_questionnaires(
    db: Session,
    user: User,
    *,
    client_id: UUID | None = None,
    search: str | None = None,
    lead_status: LeadStatus | None = None,
    manager_id: UUID | None = None,
    due_only: bool = False,
) -> list[ClientQuestionnaire]:
    stmt = (
        select(ClientQuestionnaire)
        .options(*_questionnaire_load_options())
        .where(ClientQuestionnaire.organization_id == user.organization_id)
        .order_by(ClientQuestionnaire.created_at.desc())
    )
    stmt = _apply_questionnaire_visibility_filter(stmt, user)
    if client_id is not None:
        stmt = stmt.where(ClientQuestionnaire.client_id == client_id)
    if lead_status is not None:
        stmt = stmt.where(ClientQuestionnaire.lead_status == lead_status)
    if manager_id is not None:
        stmt = stmt.where(ClientQuestionnaire.assigned_manager_id == manager_id)
    if due_only:
        stmt = stmt.where(
            ClientQuestionnaire.lead_status == LeadStatus.NO_ANSWER,
            ClientQuestionnaire.next_call_at <= local_today(),
        )
    if search:
        term = f"%{search.strip()}%"
        stmt = stmt.where(
            or_(
                ClientQuestionnaire.full_name.ilike(term),
                ClientQuestionnaire.phone.ilike(term),
            )
        )
    return list(db.scalars(stmt).unique())


def _maybe_bind_client(
    db: Session,
    user: User,
    client_id: UUID | None,
) -> UUID | None:
    if client_id is None:
        return None
    if user.role == UserRole.CALL_CENTER:
        client = ensure_client_read_access(db, user, client_id)
    else:
        client = ensure_client_write_access(db, user, client_id)
    return client.id


def create_questionnaire(
    db: Session,
    user: User,
    payload: QuestionnaireCreate,
) -> ClientQuestionnaire:
    client_id = _maybe_bind_client(db, user, payload.client_id)
    item = ClientQuestionnaire(
        organization_id=user.organization_id,
        client_id=client_id,
        created_by_id=user.id,
        assigned_manager_id=user.id if user.role in LEAD_OWNER_ROLES else None,
        lead_status=LeadStatus.NEW,
        full_name=payload.full_name,
        service_cost=payload.service_cost,
        phone=payload.phone,
        registration_region=payload.registration_region,
        fake_income_documents=payload.fake_income_documents,
        bank_accounts=payload.bank_accounts,
        has_guarantee_or_collateral=payload.has_guarantee_or_collateral,
        is_married=payload.is_married,
        dependents=payload.dependents,
        income_debtor=payload.income_debtor,
        **_family_logic_fields(payload),
        income_destination=payload.income_destination,
        has_property_encumbrance=payload.has_property_encumbrance,
        property_encumbrance_details=payload.property_encumbrance_details,
        has_recent_property_deals=payload.has_recent_property_deals,
        recent_property_deals_details=payload.recent_property_deals_details,
        property_debtor=payload.property_debtor,
        has_weapon=payload.has_weapon,
        weapon_details=payload.weapon_details,
        notes=payload.notes,
        filled_date=payload.filled_date or date.today(),
        debts=[row.model_dump(mode="json") for row in payload.debts] or empty_debts(),
        assets=(
            [row.model_dump(mode="json") for row in payload.assets]
            if payload.assets is not None
            else empty_assets()
        ),
        documents=(
            [row.model_dump(mode="json") for row in payload.documents]
            if payload.documents is not None
            else empty_documents()
        ),
    )
    db.add(item)
    db.flush()
    log_audit(
        db,
        user=user,
        entity_type="client_questionnaire",
        entity_id=item.id,
        action=AuditAction.CREATE,
        field_name="full_name",
        new_value=item.full_name,
    )
    db.commit()
    db.refresh(item)
    return get_organization_questionnaire(db, questionnaire_id=item.id, user=user)


def update_questionnaire(
    db: Session,
    user: User,
    questionnaire_id: UUID,
    payload: QuestionnaireUpdate,
) -> ClientQuestionnaire:
    item = get_organization_questionnaire(db, questionnaire_id=questionnaire_id, user=user)
    old_name = item.full_name
    item.client_id = _maybe_bind_client(db, user, payload.client_id)
    item.full_name = payload.full_name
    item.service_cost = payload.service_cost
    item.phone = payload.phone
    item.registration_region = payload.registration_region
    item.fake_income_documents = payload.fake_income_documents
    item.bank_accounts = payload.bank_accounts
    item.has_guarantee_or_collateral = payload.has_guarantee_or_collateral
    item.is_married = payload.is_married
    item.dependents = payload.dependents
    item.income_debtor = payload.income_debtor
    for field_name, field_value in _family_logic_fields(payload).items():
        setattr(item, field_name, field_value)
    item.income_destination = payload.income_destination
    item.has_property_encumbrance = payload.has_property_encumbrance
    item.property_encumbrance_details = payload.property_encumbrance_details
    item.has_recent_property_deals = payload.has_recent_property_deals
    item.recent_property_deals_details = payload.recent_property_deals_details
    item.property_debtor = payload.property_debtor
    item.has_weapon = payload.has_weapon
    item.weapon_details = payload.weapon_details
    item.notes = payload.notes
    item.filled_date = payload.filled_date
    item.debts = [row.model_dump(mode="json") for row in payload.debts]
    if payload.assets is not None:
        item.assets = [row.model_dump(mode="json") for row in payload.assets]
    if payload.documents is not None:
        item.documents = [row.model_dump(mode="json") for row in payload.documents]
    if old_name != item.full_name:
        log_audit(
            db,
            user=user,
            entity_type="client_questionnaire",
            entity_id=item.id,
            action=AuditAction.UPDATE,
            field_name="full_name",
            old_value=old_name,
            new_value=item.full_name,
        )
    db.commit()
    db.refresh(item)
    return get_organization_questionnaire(db, questionnaire_id=item.id, user=user)


def delete_questionnaire(db: Session, user: User, questionnaire_id: UUID) -> None:
    if user.role != UserRole.OWNER:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Удалять анкеты может только руководитель")
    item = get_organization_questionnaire(db, questionnaire_id=questionnaire_id, user=user)
    log_audit(
        db,
        user=user,
        entity_type="client_questionnaire",
        entity_id=item.id,
        action=AuditAction.DELETE,
        field_name="full_name",
        old_value=item.full_name,
    )
    db.delete(item)
    db.commit()


def create_client_from_questionnaire(
    db: Session,
    user: User,
    questionnaire_id: UUID,
    payload: QuestionnaireCreateClientRequest,
) -> tuple[ClientQuestionnaire, Client]:
    item = get_organization_questionnaire(db, questionnaire_id=questionnaire_id, user=user)
    if item.client_id is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="К анкете уже привязан клиент",
        )

    try:
        full_name = validate_full_name(item.full_name)
        phone = validate_phone_required(item.phone)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc

    if not phone_has_minimum_digits(phone):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=INCOMPLETE_PHONE_MESSAGE,
        )

    existing = find_existing_client(
        db,
        organization_id=user.organization_id,
        phone=phone,
        full_name=full_name,
    )
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=duplicate_client_payload(existing),
        )

    assigned_manager_id = user.id if user.role == UserRole.MANAGER else None
    client = Client(
        organization_id=user.organization_id,
        assigned_manager_id=assigned_manager_id,
        full_name=full_name,
        phone=phone,
        contract_date=payload.contract_date or item.filled_date or date.today(),
        debt_amount=Decimal("0.00"),
        engagement_stage=EngagementStage.DOCUMENT_COLLECTION,
    )
    db.add(client)
    db.flush()
    create_document_collection(db, client.id)
    item.client_id = client.id
    item.lead_status = LeadStatus.CONVERTED
    item.converted_at = datetime.now(timezone.utc)
    item.converted_by_id = user.id
    log_audit(
        db,
        user=user,
        entity_type="client",
        entity_id=client.id,
        action=AuditAction.CREATE,
        field_name="from_questionnaire",
        new_value=str(item.id),
    )
    db.commit()
    db.refresh(client)
    try_ensure_first_payment_task_for_manager_client(db, client=client, actor=user)
    item = get_organization_questionnaire(db, questionnaire_id=item.id, user=user)
    return item, client


def _ensure_lead_open(item: ClientQuestionnaire) -> None:
    if item.lead_status == LeadStatus.CONVERTED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Лид уже переведён в клиента",
        )


def log_questionnaire_call(
    db: Session,
    user: User,
    questionnaire_id: UUID,
    payload: QuestionnaireCallCreate,
) -> ClientQuestionnaire:
    item = get_organization_questionnaire(db, questionnaire_id=questionnaire_id, user=user)
    now = datetime.now(timezone.utc)
    db.add(
        QuestionnaireCall(
            organization_id=item.organization_id,
            questionnaire_id=item.id,
            created_by_id=user.id,
            outcome=payload.outcome,
            comment=payload.comment,
        )
    )
    item.call_attempts = (item.call_attempts or 0) + 1
    item.last_call_at = now

    if payload.outcome == LeadCallOutcome.NO_ANSWER:
        # Недозвон не теряется: лид уходит в очередь перезвона на конкретную дату.
        item.next_call_at = payload.next_call_at or local_today()
        if item.lead_status in {LeadStatus.NEW, LeadStatus.IN_PROGRESS}:
            item.lead_status = LeadStatus.NO_ANSWER
    else:
        item.next_call_at = payload.next_call_at
        if item.lead_status in {LeadStatus.NEW, LeadStatus.NO_ANSWER}:
            item.lead_status = LeadStatus.IN_PROGRESS

    db.commit()
    return get_organization_questionnaire(db, questionnaire_id=item.id, user=user)


def mark_questionnaire_unqualified(
    db: Session,
    user: User,
    questionnaire_id: UUID,
    payload: QuestionnaireUnqualifyRequest,
) -> ClientQuestionnaire:
    item = get_organization_questionnaire(db, questionnaire_id=questionnaire_id, user=user)
    _ensure_lead_open(item)
    item.lead_status = LeadStatus.UNQUALIFIED
    item.unqualified_reason = payload.reason
    item.unqualified_at = datetime.now(timezone.utc)
    item.unqualified_by_id = user.id
    item.next_call_at = None
    log_audit(
        db,
        user=user,
        entity_type="client_questionnaire",
        entity_id=item.id,
        action=AuditAction.UPDATE,
        field_name="lead_status",
        new_value=f"{LeadStatus.UNQUALIFIED.value}: {payload.reason}",
    )
    db.commit()
    return get_organization_questionnaire(db, questionnaire_id=item.id, user=user)


def reopen_questionnaire(db: Session, user: User, questionnaire_id: UUID) -> ClientQuestionnaire:
    item = get_organization_questionnaire(db, questionnaire_id=questionnaire_id, user=user)
    _ensure_lead_open(item)
    item.lead_status = LeadStatus.IN_PROGRESS if item.call_attempts else LeadStatus.NEW
    item.unqualified_reason = None
    item.unqualified_at = None
    item.unqualified_by_id = None
    db.commit()
    return get_organization_questionnaire(db, questionnaire_id=item.id, user=user)


def assign_questionnaire(
    db: Session,
    user: User,
    questionnaire_id: UUID,
    payload: QuestionnaireAssignRequest,
) -> ClientQuestionnaire:
    if user.role not in LEAD_SUPERVISOR_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Переназначать лиды может руководитель или начальник отдела",
        )
    item = get_organization_questionnaire(db, questionnaire_id=questionnaire_id, user=user)
    if payload.manager_id is None:
        item.assigned_manager_id = None
    else:
        manager = db.scalar(
            select(User).where(
                User.id == payload.manager_id,
                User.organization_id == user.organization_id,
                User.is_active.is_(True),
            )
        )
        if manager is None or manager.role not in LEAD_OWNER_ROLES | {UserRole.OWNER}:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Лид можно закрепить только за менеджером",
            )
        item.assigned_manager_id = manager.id
    db.commit()
    return get_organization_questionnaire(db, questionnaire_id=item.id, user=user)


def list_lead_managers(db: Session, user: User) -> list[QuestionnaireManagerOption]:
    rows = db.scalars(
        select(User)
        .where(
            User.organization_id == user.organization_id,
            User.is_active.is_(True),
            User.role.in_([UserRole.MANAGER, UserRole.HEAD_MANAGER, UserRole.OWNER]),
        )
        .order_by(User.full_name)
    )
    return [
        QuestionnaireManagerOption(id=row.id, full_name=row.full_name, role=row.role.value)
        for row in rows
    ]


def daily_lead_stats(db: Session, user: User, *, day: date | None = None) -> LeadStatsResponse:
    """Срез за сутки по каждому менеджеру: сколько лидов завёл, сколько звонил,
    сколько дозвонился, сколько отсеял и сколько довёл до клиента."""
    target_day = day or local_today()
    start, end = local_day_bounds(target_day)
    organization_id = user.organization_id
    only_self = user.id if user.role not in LEAD_SUPERVISOR_ROLES else None

    rows: dict[UUID | None, LeadStatsRow] = {}
    names: dict[UUID | None, str] = {}

    def bucket(manager_id: UUID | None) -> LeadStatsRow:
        if manager_id not in rows:
            rows[manager_id] = LeadStatsRow(
                manager_id=manager_id,
                manager_name=names.get(manager_id) or "Без менеджера",
            )
        return rows[manager_id]

    def scoped(stmt, actor_column):
        stmt = stmt.where(ClientQuestionnaire.organization_id == organization_id)
        if only_self is not None:
            stmt = stmt.where(actor_column == only_self)
        return stmt

    for staff in db.scalars(
        select(User).where(
            User.organization_id == organization_id,
            User.role.in_([UserRole.MANAGER, UserRole.HEAD_MANAGER, UserRole.OWNER]),
        )
    ):
        names[staff.id] = staff.full_name

    added = db.execute(
        scoped(
            select(ClientQuestionnaire.created_by_id, func.count())
            .where(
                ClientQuestionnaire.created_at >= start,
                ClientQuestionnaire.created_at < end,
            )
            .group_by(ClientQuestionnaire.created_by_id),
            ClientQuestionnaire.created_by_id,
        )
    )
    for manager_id, count in added:
        bucket(manager_id).leads_added = count

    calls_stmt = (
        select(QuestionnaireCall.created_by_id, QuestionnaireCall.outcome, func.count())
        .where(
            QuestionnaireCall.organization_id == organization_id,
            QuestionnaireCall.created_at >= start,
            QuestionnaireCall.created_at < end,
        )
        .group_by(QuestionnaireCall.created_by_id, QuestionnaireCall.outcome)
    )
    if only_self is not None:
        calls_stmt = calls_stmt.where(QuestionnaireCall.created_by_id == only_self)
    for manager_id, outcome, count in db.execute(calls_stmt):
        row = bucket(manager_id)
        row.calls_total += count
        if outcome == LeadCallOutcome.ANSWERED:
            row.calls_answered += count
        else:
            row.calls_no_answer += count

    unqualified = db.execute(
        scoped(
            select(ClientQuestionnaire.unqualified_by_id, func.count())
            .where(
                ClientQuestionnaire.unqualified_at >= start,
                ClientQuestionnaire.unqualified_at < end,
            )
            .group_by(ClientQuestionnaire.unqualified_by_id),
            ClientQuestionnaire.unqualified_by_id,
        )
    )
    for manager_id, count in unqualified:
        bucket(manager_id).unqualified = count

    converted = db.execute(
        scoped(
            select(ClientQuestionnaire.converted_by_id, func.count())
            .where(
                ClientQuestionnaire.converted_at >= start,
                ClientQuestionnaire.converted_at < end,
            )
            .group_by(ClientQuestionnaire.converted_by_id),
            ClientQuestionnaire.converted_by_id,
        )
    )
    for manager_id, count in converted:
        bucket(manager_id).converted = count

    for manager_id, row in rows.items():
        row.manager_name = names.get(manager_id) or "Без менеджера"

    ordered = sorted(rows.values(), key=lambda row: row.manager_name)
    totals = LeadStatsRow(manager_id=None, manager_name="Итого")
    for row in ordered:
        totals.leads_added += row.leads_added
        totals.calls_total += row.calls_total
        totals.calls_answered += row.calls_answered
        totals.calls_no_answer += row.calls_no_answer
        totals.unqualified += row.unqualified
        totals.converted += row.converted
    return LeadStatsResponse(day=target_day, rows=ordered, totals=totals)


def to_questionnaire_response(item: ClientQuestionnaire) -> QuestionnaireResponse:
    created_by_name = item.created_by.full_name if item.created_by is not None else None
    return QuestionnaireResponse(
        id=item.id,
        organization_id=item.organization_id,
        client_id=item.client_id,
        full_name=item.full_name,
        phone=item.phone,
        registration_region=item.registration_region,
        service_cost=item.service_cost,
        filled_date=item.filled_date,
        created_by_id=item.created_by_id,
        created_by_name=created_by_name,
        created_at=item.created_at,
        updated_at=item.updated_at,
        lead_status=item.lead_status,
        unqualified_reason=item.unqualified_reason,
        next_call_at=item.next_call_at,
        last_call_at=item.last_call_at,
        call_attempts=item.call_attempts or 0,
        assigned_manager_id=item.assigned_manager_id,
        assigned_manager_name=(
            item.assigned_manager.full_name if item.assigned_manager is not None else None
        ),
        calls=[
            QuestionnaireCallResponse(
                id=call.id,
                outcome=call.outcome,
                comment=call.comment,
                created_by_id=call.created_by_id,
                created_by_name=call.created_by.full_name if call.created_by else None,
                created_at=call.created_at,
            )
            for call in item.calls
        ],
        fake_income_documents=item.fake_income_documents,
        bank_accounts=item.bank_accounts,
        has_guarantee_or_collateral=item.has_guarantee_or_collateral,
        is_married=item.is_married,
        divorce_info=item.divorce_info,
        dependents=item.dependents,
        income_debtor=item.income_debtor,
        income_spouse=item.income_spouse,
        income_destination=item.income_destination,
        has_property_encumbrance=item.has_property_encumbrance,
        property_encumbrance_details=item.property_encumbrance_details,
        has_recent_property_deals=item.has_recent_property_deals,
        recent_property_deals_details=item.recent_property_deals_details,
        property_debtor=getattr(item, "property_debtor", None),
        property_spouse=getattr(item, "property_spouse", None),
        has_weapon=getattr(item, "has_weapon", None),
        weapon_details=getattr(item, "weapon_details", None),
        notes=item.notes,
        debts=item.debts or empty_debts(),
        assets=item.assets or empty_assets(),
        documents=item.documents or empty_documents(),
    )


def pdf_filename(item: ClientQuestionnaire) -> str:
    ascii_name = "".join(
        ch if ch.isascii() and (ch.isalnum() or ch in ("-", "_")) else "_"
        for ch in item.full_name
    ).strip("_") or "anketa"
    return f"anketa_{ascii_name}_{item.id.hex[:8]}.pdf"


def pdf_content_disposition(item: ClientQuestionnaire) -> str:
    filename = pdf_filename(item)
    utf_name = f"Анкета_{item.full_name}.pdf".replace('"', "")
    return f"attachment; filename=\"{filename}\"; filename*=UTF-8''{quote(utf_name)}"
