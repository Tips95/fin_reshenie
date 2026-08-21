from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.api.deps import require_legal_staff
from app.core.database import get_db
from app.models.user import User
from app.schemas.questionnaire import (
    QuestionnaireBrief,
    QuestionnaireCreate,
    QuestionnaireCreateClientRequest,
    QuestionnaireResponse,
    QuestionnaireUpdate,
)
from app.services.questionnaires import (
    create_client_from_questionnaire,
    create_questionnaire,
    delete_questionnaire,
    ensure_bankruptcy_org,
    get_organization_questionnaire,
    list_questionnaires,
    pdf_content_disposition,
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
    current_user: User = Depends(_require_legal_staff),
    db: Session = Depends(get_db),
) -> list[QuestionnaireBrief]:
    items = list_questionnaires(db, current_user, client_id=client_id, search=search)
    return [_to_brief(item) for item in items]


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
