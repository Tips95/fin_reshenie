from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.api.deps import require_legal_staff
from app.core.database import get_db
from app.models.enums import LeadStatus
from app.models.user import User
from app.schemas.questionnaire import (
    LeadCountsByDayResponse,
    LeadStatsResponse,
    QuestionnaireAppointmentRequest,
    QuestionnaireAssignRequest,
    QuestionnaireBrief,
    QuestionnaireCallCreate,
    QuestionnaireCreate,
    QuestionnaireCreateClientRequest,
    QuestionnaireManagerOption,
    QuestionnaireResponse,
    QuestionnaireUnqualifyRequest,
    QuestionnaireUpdate,
)
from app.services.questionnaires import (
    assign_questionnaire,
    create_client_from_questionnaire,
    create_questionnaire,
    daily_lead_stats,
    delete_questionnaire,
    ensure_bankruptcy_org,
    get_organization_questionnaire,
    lead_counts_by_day,
    list_lead_managers,
    list_questionnaires,
    log_questionnaire_call,
    mark_questionnaire_unqualified,
    pdf_content_disposition,
    reopen_questionnaire,
    set_questionnaire_appointment,
    to_questionnaire_response,
    update_questionnaire,
)
from app.services.questionnaire_pdf import build_questionnaire_pdf

router = APIRouter()


def _require_legal_staff(
    current_user: User = Depends(require_legal_staff),
) -> User:
    ensure_bankruptcy_org(current_user)
    return current_user


def _to_brief(item) -> QuestionnaireBrief:
    payload = to_questionnaire_response(item)
    return QuestionnaireBrief.model_validate(payload.model_dump())


@router.get("", response_model=list[QuestionnaireBrief])
def get_questionnaires(
    client_id: UUID | None = Query(default=None),
    search: str | None = Query(default=None, min_length=2),
    lead_status: LeadStatus | None = Query(default=None),
    manager_id: UUID | None = Query(default=None),
    created_by_id: UUID | None = Query(default=None),
    created_on: date | None = Query(default=None),
    due_only: bool = Query(default=False),
    appointment_due: bool = Query(default=False),
    current_user: User = Depends(_require_legal_staff),
    db: Session = Depends(get_db),
) -> list[QuestionnaireBrief]:
    items = list_questionnaires(
        db,
        current_user,
        client_id=client_id,
        search=search,
        lead_status=lead_status,
        manager_id=manager_id,
        created_by_id=created_by_id,
        created_on=created_on,
        due_only=due_only,
        appointment_due=appointment_due,
    )
    return [_to_brief(item) for item in items]


@router.get("/stats/daily", response_model=LeadStatsResponse)
def get_daily_lead_stats(
    day: date | None = Query(default=None),
    current_user: User = Depends(_require_legal_staff),
    db: Session = Depends(get_db),
) -> LeadStatsResponse:
    return daily_lead_stats(db, current_user, day=day)


@router.get("/stats/by-day", response_model=LeadCountsByDayResponse)
def get_lead_counts_by_day(
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    manager_id: UUID | None = Query(default=None),
    current_user: User = Depends(_require_legal_staff),
    db: Session = Depends(get_db),
) -> LeadCountsByDayResponse:
    return lead_counts_by_day(
        db,
        current_user,
        date_from=date_from,
        date_to=date_to,
        manager_id=manager_id,
    )


@router.get("/managers", response_model=list[QuestionnaireManagerOption])
def get_lead_managers(
    current_user: User = Depends(_require_legal_staff),
    db: Session = Depends(get_db),
) -> list[QuestionnaireManagerOption]:
    return list_lead_managers(db, current_user)


@router.post("", response_model=QuestionnaireResponse, status_code=status.HTTP_201_CREATED)
def post_questionnaire(
    payload: QuestionnaireCreate,
    current_user: User = Depends(_require_legal_staff),
    db: Session = Depends(get_db),
) -> QuestionnaireResponse:
    item = create_questionnaire(db, current_user, payload)
    return to_questionnaire_response(item)


@router.get("/{questionnaire_id}", response_model=QuestionnaireResponse)
def get_questionnaire(
    questionnaire_id: UUID,
    current_user: User = Depends(_require_legal_staff),
    db: Session = Depends(get_db),
) -> QuestionnaireResponse:
    item = get_organization_questionnaire(
        db,
        questionnaire_id=questionnaire_id,
        user=current_user,
    )
    return to_questionnaire_response(item)


@router.patch("/{questionnaire_id}", response_model=QuestionnaireResponse)
def patch_questionnaire(
    questionnaire_id: UUID,
    payload: QuestionnaireUpdate,
    current_user: User = Depends(_require_legal_staff),
    db: Session = Depends(get_db),
) -> QuestionnaireResponse:
    item = update_questionnaire(db, current_user, questionnaire_id, payload)
    return to_questionnaire_response(item)


@router.delete("/{questionnaire_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_questionnaire(
    questionnaire_id: UUID,
    current_user: User = Depends(_require_legal_staff),
    db: Session = Depends(get_db),
) -> None:
    delete_questionnaire(db, current_user, questionnaire_id)


@router.post("/{questionnaire_id}/calls", response_model=QuestionnaireResponse)
def post_questionnaire_call(
    questionnaire_id: UUID,
    payload: QuestionnaireCallCreate,
    current_user: User = Depends(_require_legal_staff),
    db: Session = Depends(get_db),
) -> QuestionnaireResponse:
    item = log_questionnaire_call(db, current_user, questionnaire_id, payload)
    return to_questionnaire_response(item)


@router.post("/{questionnaire_id}/unqualify", response_model=QuestionnaireResponse)
def post_questionnaire_unqualify(
    questionnaire_id: UUID,
    payload: QuestionnaireUnqualifyRequest,
    current_user: User = Depends(_require_legal_staff),
    db: Session = Depends(get_db),
) -> QuestionnaireResponse:
    item = mark_questionnaire_unqualified(db, current_user, questionnaire_id, payload)
    return to_questionnaire_response(item)


@router.post("/{questionnaire_id}/reopen", response_model=QuestionnaireResponse)
def post_questionnaire_reopen(
    questionnaire_id: UUID,
    current_user: User = Depends(_require_legal_staff),
    db: Session = Depends(get_db),
) -> QuestionnaireResponse:
    item = reopen_questionnaire(db, current_user, questionnaire_id)
    return to_questionnaire_response(item)


@router.post("/{questionnaire_id}/assign", response_model=QuestionnaireResponse)
def post_questionnaire_assign(
    questionnaire_id: UUID,
    payload: QuestionnaireAssignRequest,
    current_user: User = Depends(_require_legal_staff),
    db: Session = Depends(get_db),
) -> QuestionnaireResponse:
    item = assign_questionnaire(db, current_user, questionnaire_id, payload)
    return to_questionnaire_response(item)


@router.post("/{questionnaire_id}/appointment", response_model=QuestionnaireResponse)
def post_questionnaire_appointment(
    questionnaire_id: UUID,
    payload: QuestionnaireAppointmentRequest,
    current_user: User = Depends(_require_legal_staff),
    db: Session = Depends(get_db),
) -> QuestionnaireResponse:
    item = set_questionnaire_appointment(db, current_user, questionnaire_id, payload)
    return to_questionnaire_response(item)


@router.post("/{questionnaire_id}/create-client", response_model=QuestionnaireResponse)
def post_create_client(
    questionnaire_id: UUID,
    payload: QuestionnaireCreateClientRequest,
    current_user: User = Depends(_require_legal_staff),
    db: Session = Depends(get_db),
) -> QuestionnaireResponse:
    item, _client = create_client_from_questionnaire(db, current_user, questionnaire_id, payload)
    return to_questionnaire_response(item)


@router.get("/{questionnaire_id}/pdf")
def download_questionnaire_pdf(
    questionnaire_id: UUID,
    current_user: User = Depends(_require_legal_staff),
    db: Session = Depends(get_db),
) -> Response:
    item = get_organization_questionnaire(
        db,
        questionnaire_id=questionnaire_id,
        user=current_user,
    )
    try:
        content = build_questionnaire_pdf(item)
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Не удалось сформировать PDF: отсутствуют шрифты",
        ) from exc
    return Response(
        content=content,
        media_type="application/pdf",
        headers={"Content-Disposition": pdf_content_disposition(item)},
    )
