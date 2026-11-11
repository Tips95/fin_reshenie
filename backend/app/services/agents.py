"""Удалённые менеджеры: регистрация на сайте, куратор, кабинет и выплаты.

Агент регистрируется сам кнопкой на сайте, принимая пользовательское соглашение,
и сразу получает доступ. Заводит лида и записывает в офис; договор заключает штатный менеджер.
За клиента, внёсшего первый платёж по договору, агенту полагается 5 000 ₽.
"""

import uuid
from collections import defaultdict
from datetime import date, datetime, timezone
from decimal import Decimal
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.core.security import get_password_hash
from app.models.client import AGENT_COMMISSION, MANAGER_FIRST_COMMISSION_SINCE, Client
from app.models.client_questionnaire import ClientQuestionnaire
from app.models.enums import (
    AuditAction,
    ClientStatus,
    EngagementStage,
    LeadStatus,
    OrganizationType,
    UserRole,
)
from app.models.organization import Organization
from app.models.user import User
from app.schemas.agent import (
    AgentCommissionAgentRow,
    AgentCommissionClientItem,
    AgentCommissionsOverview,
    AgentCuratorContact,
    AgentLeadRow,
    AgentLeadStage,
    AgentOverview,
    AgentRegisterRequest,
    AgentResponse,
)
from app.services.accounts import assert_contacts_available, parse_login
from app.services.agent_ranking import (
    award_totals,
    earned_clients_stmt,
    month_award_items,
    unpaid_awards_total,
)
from app.services.audit import log_audit
from app.services.manager_first_commissions import (
    contract_client_filters,
    first_payment_dates_subquery,
)
from app.services.notifications import notify_curator_about_new_agent
from app.services.phone import month_bounds

CURATOR_ROLES = {UserRole.OWNER, UserRole.HEAD_MANAGER, UserRole.MANAGER}
# Сменить куратора и отключить агента могут руководитель и начальник отдела.
AGENT_ADMIN_ROLES = {UserRole.OWNER, UserRole.HEAD_MANAGER}
# Меняется вместе с текстом соглашения на фронтенде (/agent-terms).
AGENT_TERMS_VERSION = "2026-11-06"
SIGNUP_CLOSED = "Регистрация удалённых менеджеров сейчас закрыта."
DISABLED_LOGIN_MESSAGE = "Доступ отключён компанией. Если это ошибка — свяжитесь с куратором."


# --- Открытая регистрация -----------------------------------------------------


def find_signup_organization(db: Session) -> Organization | None:
    return db.scalar(
        select(Organization)
        .where(
            Organization.agent_signup_open.is_(True),
            Organization.organization_type == OrganizationType.BANKRUPTCY,
        )
        .order_by(Organization.created_at)
        .limit(1)
    )


def get_signup_organization(db: Session) -> Organization:
    organization = find_signup_organization(db)
    if organization is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=SIGNUP_CLOSED)
    return organization


def set_agent_signup_open(db: Session, owner: User, is_open: bool) -> bool:
    organization = db.get(Organization, owner.organization_id)
    if is_open:
        current = find_signup_organization(db)
        if current is not None and current.id != organization.id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Регистрация удалённых менеджеров на сайте уже открыта для другой компании",
            )
    if organization.agent_signup_open != is_open:
        log_audit(
            db,
            user=owner,
            entity_type="organization",
            entity_id=organization.id,
            action=AuditAction.UPDATE,
            field_name="agent_signup_open",
            old_value=organization.agent_signup_open,
            new_value=is_open,
        )
        organization.agent_signup_open = is_open
        db.commit()
    return organization.agent_signup_open


# --- Регистрация и куратор ----------------------------------------------------


def _pick_curator_id(db: Session, organization_id: UUID) -> UUID | None:
    """Наименее загруженный из отмеченных кураторов; если их нет — руководитель."""
    curated = (
        select(User.curator_id, func.count().label("agents"))
        .where(User.organization_id == organization_id, User.role == UserRole.AGENT)
        .group_by(User.curator_id)
        .subquery()
    )
    for condition in (User.is_agent_curator.is_(True), User.role == UserRole.OWNER):
        curator_id = db.scalar(
            select(User.id)
            .outerjoin(curated, curated.c.curator_id == User.id)
            .where(
                User.organization_id == organization_id,
                User.is_active.is_(True),
                User.role.in_(CURATOR_ROLES),
                condition,
            )
            .order_by(func.coalesce(curated.c.agents, 0), User.created_at)
            .limit(1)
        )
        if curator_id is not None:
            return curator_id
    return None


def sees_all_agents(user: User) -> bool:
    return user.role in AGENT_ADMIN_ROLES or user.is_agent_curator


def register_agent(db: Session, payload: AgentRegisterRequest) -> User:
    organization = get_signup_organization(db)
    if payload.terms_version != AGENT_TERMS_VERSION:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Пользовательское соглашение обновилось. Обновите страницу и примите новую редакцию.",
        )
    email = payload.email.strip().lower() if payload.email else None
    # Вход сравнивает телефон строкой, поэтому храним как +7XXXXXXXXXX.
    _, phone = parse_login(payload.phone)
    if phone is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Укажите российский номер телефона",
        )
    assert_contacts_available(
        db,
        organization_type=OrganizationType.BANKRUPTCY,
        email=email,
        phone=phone,
    )
    agent = User(
        id=uuid.uuid4(),
        organization_id=organization.id,
        full_name=payload.full_name,
        phone=phone,
        email=email,
        telegram=payload.telegram,
        inn=payload.inn,
        password_hash=get_password_hash(payload.password),
        role=UserRole.AGENT,
        is_active=True,
        curator_id=_pick_curator_id(db, organization.id),
        terms_accepted_at=datetime.now(timezone.utc),
        terms_version=AGENT_TERMS_VERSION,
    )
    db.add(agent)
    db.flush()
    notify_curator_about_new_agent(db, agent, curator_id=agent.curator_id)
    db.commit()
    db.refresh(agent)
    return agent


def inactive_agent_login_message(user: User | None) -> str | None:
    if user is None or user.role != UserRole.AGENT:
        return None
    return DISABLED_LOGIN_MESSAGE


def get_organization_agent(db: Session, *, agent_id: UUID, user: User) -> User:
    agent = db.get(User, agent_id)
    if (
        agent is None
        or agent.organization_id != user.organization_id
        or agent.role != UserRole.AGENT
        or (not sees_all_agents(user) and agent.curator_id != user.id)
    ):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Удалённый менеджер не найден")
    return agent


def ensure_agent_admin(user: User) -> None:
    if user.role not in AGENT_ADMIN_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Это может руководитель или начальник отдела",
        )


def list_curators(db: Session, user: User) -> list[User]:
    return list(
        db.scalars(
            select(User)
            .where(
                User.organization_id == user.organization_id,
                User.is_active.is_(True),
                User.role.in_(CURATOR_ROLES),
                User.is_agent_curator.is_(True),
            )
            .order_by(User.full_name)
        )
    )


def resolve_curator(db: Session, *, curator_id: UUID, organization_id: UUID) -> User:
    curator = db.get(User, curator_id)
    if (
        curator is None
        or curator.organization_id != organization_id
        or not curator.is_active
        or curator.role not in CURATOR_ROLES
        or not curator.is_agent_curator
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Куратором может быть только сотрудник, отмеченный в «Команде» как куратор удалённых менеджеров",
        )
    return curator


def _audit(db: Session, owner: User, agent: User, field: str, old, new) -> None:
    log_audit(
        db,
        user=owner,
        entity_type="user",
        entity_id=agent.id,
        action=AuditAction.UPDATE,
        field_name=field,
        old_value=old,
        new_value=new,
    )


def set_agent_curator(db: Session, owner: User, agent_id: UUID, curator_id: UUID | None) -> User:
    ensure_agent_admin(owner)
    agent = get_organization_agent(db, agent_id=agent_id, user=owner)
    new_curator_id = None
    if curator_id is not None:
        new_curator_id = resolve_curator(
            db, curator_id=curator_id, organization_id=owner.organization_id
        ).id
    if agent.curator_id != new_curator_id:
        _audit(db, owner, agent, "curator_id", agent.curator_id, new_curator_id)
        agent.curator_id = new_curator_id
        notify_curator_about_new_agent(db, agent, curator_id=new_curator_id, actor=owner)
        db.commit()
        db.refresh(agent)
    return agent


def set_agent_active(db: Session, user: User, agent_id: UUID, is_active: bool) -> User:
    ensure_agent_admin(user)
    agent = get_organization_agent(db, agent_id=agent_id, user=user)
    if agent.is_active != is_active:
        _audit(db, user, agent, "is_active", agent.is_active, is_active)
        agent.is_active = is_active
        db.commit()
    return agent


def set_agent_note(db: Session, user: User, agent_id: UUID, note: str | None) -> User:
    agent = get_organization_agent(db, agent_id=agent_id, user=user)
    note = (note or "").strip() or None
    if agent.agent_note != note:
        agent.agent_note = note
        db.commit()
    return agent


def active_curator_id(agent: User) -> UUID | None:
    curator = agent.curator
    if curator is None or not curator.is_active or curator.role not in CURATOR_ROLES:
        return None
    return curator.id


# --- Списки и кабинет ---------------------------------------------------------


def list_agents(db: Session, owner: User, *, agent_id: UUID | None = None) -> list[AgentResponse]:
    stmt = (
        select(User)
        .options(joinedload(User.curator))
        .where(User.organization_id == owner.organization_id, User.role == UserRole.AGENT)
        .order_by(User.created_at.desc())
    )
    if not sees_all_agents(owner):
        stmt = stmt.where(User.curator_id == owner.id)
    if agent_id is not None:
        stmt = stmt.where(User.id == agent_id)
    agents = list(db.scalars(stmt).unique())
    if not agents:
        return []
    agent_ids = [agent.id for agent in agents]

    leads_by_agent = dict(
        db.execute(
            select(ClientQuestionnaire.source_agent_id, func.count())
            .where(
                ClientQuestionnaire.organization_id == owner.organization_id,
                ClientQuestionnaire.source_agent_id.in_(agent_ids),
            )
            .group_by(ClientQuestionnaire.source_agent_id)
        ).all()
    )
    contracts_by_agent = dict(
        db.execute(
            select(Client.source_agent_id, func.count())
            .where(
                *contract_client_filters(owner.organization_id),
                Client.source_agent_id.in_(agent_ids),
            )
            .group_by(Client.source_agent_id)
        ).all()
    )
    earned: dict[UUID, Decimal] = defaultdict(lambda: Decimal("0.00"))
    paid: dict[UUID, Decimal] = defaultdict(lambda: Decimal("0.00"))
    _, earned_stmt = earned_clients_stmt(owner.organization_id)
    for client, _first_payment_date in db.execute(
        earned_stmt.where(Client.source_agent_id.in_(agent_ids))
    ):
        earned[client.source_agent_id] += AGENT_COMMISSION
        if client.agent_commission_collected:
            paid[client.source_agent_id] += AGENT_COMMISSION
    for agent_id, (award_earned, award_paid) in award_totals(
        db, owner.organization_id, agent_ids
    ).items():
        earned[agent_id] += award_earned
        paid[agent_id] += award_paid

    return [
        AgentResponse(
            id=agent.id,
            full_name=agent.full_name,
            phone=agent.phone,
            email=agent.email,
            telegram=agent.telegram,
            inn=agent.inn,
            is_active=agent.is_active,
            curator_id=agent.curator_id,
            curator_name=agent.curator.full_name if agent.curator is not None else None,
            created_at=agent.created_at,
            terms_accepted_at=agent.terms_accepted_at,
            terms_version=agent.terms_version,
            agent_note=agent.agent_note,
            leads_total=leads_by_agent.get(agent.id, 0),
            contracts_total=contracts_by_agent.get(agent.id, 0),
            earned_total=earned[agent.id],
            paid_total=paid[agent.id],
        )
        for agent in agents
    ]


def _lead_stage(
    item: ClientQuestionnaire,
    client: Client | None,
    first_payment_date: date | None,
) -> AgentLeadStage:
    if client is not None:
        if client.is_deleted or client.status == ClientStatus.CANCELLED:
            return "cancelled"
        if client.engagement_stage == EngagementStage.DOCUMENT_COLLECTION:
            return "visited"
        if first_payment_date is None:
            return "contract"
        return "paid_out" if client.agent_commission_collected else "earned"
    if item.lead_status == LeadStatus.UNQUALIFIED:
        return "unqualified"
    if item.appointment_at is not None:
        return "appointment"
    return "new"


def get_agent_overview(db: Session, agent: User) -> AgentOverview:
    curator = agent.curator if active_curator_id(agent) else None
    leads = list(
        db.scalars(
            select(ClientQuestionnaire)
            .options(joinedload(ClientQuestionnaire.client))
            .where(
                ClientQuestionnaire.organization_id == agent.organization_id,
                ClientQuestionnaire.source_agent_id == agent.id,
            )
            .order_by(ClientQuestionnaire.created_at.desc())
        ).unique()
    )
    client_ids = [item.client_id for item in leads if item.client_id is not None]
    first_paid_by_client: dict[UUID, date] = {}
    if client_ids:
        first_paid = first_payment_dates_subquery()
        first_paid_by_client = dict(
            db.execute(
                select(first_paid.c.client_id, first_paid.c.first_payment_date).where(
                    first_paid.c.client_id.in_(client_ids)
                )
            ).all()
        )

    rows: list[AgentLeadRow] = []
    earned_total = Decimal("0.00")
    paid_total = Decimal("0.00")
    contracts_total = 0
    appointments_total = 0
    for item in leads:
        # Выплата идёт только за клиента, закреплённого за этим агентом.
        client = item.client if item.client and item.client.source_agent_id == agent.id else None
        first_payment_date = first_paid_by_client.get(client.id) if client else None
        if first_payment_date is not None and first_payment_date < MANAGER_FIRST_COMMISSION_SINCE:
            first_payment_date = None
        stage = _lead_stage(item, client, first_payment_date)
        amount = AGENT_COMMISSION if stage in ("earned", "paid_out") else None
        if stage in ("contract", "earned", "paid_out"):
            contracts_total += 1
        if stage == "appointment":
            appointments_total += 1
        if amount is not None:
            earned_total += amount
            if stage == "paid_out":
                paid_total += amount
        rows.append(
            AgentLeadRow(
                questionnaire_id=item.id,
                full_name=item.full_name,
                phone=item.phone,
                created_at=item.created_at,
                lead_status=item.lead_status,
                stage=stage,
                appointment_at=item.appointment_at,
                first_payment_date=first_payment_date,
                commission_amount=amount,
                commission_paid_at=client.agent_commission_collected_at if stage == "paid_out" else None,
            )
        )

    award_earned, award_paid = award_totals(db, agent.organization_id, [agent.id]).get(
        agent.id, (Decimal("0.00"), Decimal("0.00"))
    )
    earned_total += award_earned
    paid_total += award_paid

    return AgentOverview(
        curator=(
            AgentCuratorContact(
                full_name=curator.full_name,
                phone=curator.phone,
                email=curator.email,
                telegram=curator.telegram,
            )
            if curator is not None
            else None
        ),
        commission_per_client=AGENT_COMMISSION,
        leads_total=len(leads),
        appointments_total=appointments_total,
        contracts_total=contracts_total,
        earned_total=earned_total,
        paid_total=paid_total,
        to_pay_total=earned_total - paid_total,
        leads=rows,
    )


# --- Выплаты агентам ----------------------------------------------------------


def get_agent_commissions_overview(db: Session, owner: User, *, month: str) -> AgentCommissionsOverview:
    start, end = month_bounds(month)
    awards = month_award_items(db, owner.organization_id, month)
    first_paid, stmt = earned_clients_stmt(owner.organization_id)
    rows = list(
        db.execute(
            stmt.options(joinedload(Client.source_agent))
            .where(
                first_paid.c.first_payment_date >= start,
                first_paid.c.first_payment_date <= end,
            )
            .order_by(first_paid.c.first_payment_date.desc(), Client.full_name.asc())
        ).unique()
    )
    outstanding_count = db.scalar(
        select(func.count())
        .select_from(Client)
        .join(first_paid, first_paid.c.client_id == Client.id)
        .where(
            *contract_client_filters(owner.organization_id),
            Client.source_agent_id.is_not(None),
            first_paid.c.first_payment_date >= MANAGER_FIRST_COMMISSION_SINCE,
            Client.agent_commission_collected.is_(False),
        )
    ) or 0

    by_agent: dict[UUID, list[AgentCommissionClientItem]] = defaultdict(list)
    agents: dict[UUID, User] = {}
    for client, first_payment_date in rows:
        agent = client.source_agent
        agents[client.source_agent_id] = agent
        by_agent[client.source_agent_id].append(
            AgentCommissionClientItem(
                client_id=client.id,
                client_name=client.full_name,
                contract_date=client.contract_date,
                first_payment_date=first_payment_date,
                agent_id=client.source_agent_id,
                agent_name=agent.full_name if agent else "—",
                amount=AGENT_COMMISSION,
                collected=client.agent_commission_collected,
                collected_at=client.agent_commission_collected_at,
            )
        )

    result_rows: list[AgentCommissionAgentRow] = []
    total = to_pay = paid = Decimal("0.00")
    for agent_id, items in by_agent.items():
        row_total = AGENT_COMMISSION * len(items)
        row_paid = AGENT_COMMISSION * sum(1 for item in items if item.collected)
        total += row_total
        paid += row_paid
        to_pay += row_total - row_paid
        agent = agents.get(agent_id)
        result_rows.append(
            AgentCommissionAgentRow(
                agent_id=agent_id,
                agent_name=agent.full_name if agent else "—",
                inn=agent.inn if agent else None,
                clients_count=len(items),
                total_amount=row_total,
                to_pay_amount=row_total - row_paid,
                paid_amount=row_paid,
                clients=items,
            )
        )
    result_rows.sort(key=lambda row: (-float(row.to_pay_amount), row.agent_name.casefold()))
    for award in awards:
        total += award.amount
        if award.paid:
            paid += award.amount
        else:
            to_pay += award.amount

    return AgentCommissionsOverview(
        month=month,
        commission_per_client=AGENT_COMMISSION,
        clients_count=sum(row.clients_count for row in result_rows),
        total_amount=total,
        to_pay_amount=to_pay,
        paid_amount=paid,
        outstanding_to_pay_amount=AGENT_COMMISSION * outstanding_count
        + unpaid_awards_total(db, owner.organization_id),
        agents=result_rows,
        awards=awards,
    )


def set_agent_commission_collected(
    db: Session,
    owner: User,
    client_ids: list[UUID],
    collected: bool,
) -> int:
    if not client_ids:
        return 0
    first_paid = first_payment_dates_subquery()
    clients = list(
        db.scalars(
            select(Client)
            .join(first_paid, first_paid.c.client_id == Client.id)
            .where(
                *contract_client_filters(owner.organization_id),
                Client.source_agent_id.is_not(None),
                Client.id.in_(client_ids),
            )
        )
    )
    if len(clients) != len(set(client_ids)):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Выплату агенту можно отметить только за клиента с первым платежом по договору",
        )
    now = datetime.now(timezone.utc)
    updated = 0
    for client in clients:
        if client.agent_commission_collected == collected:
            continue
        log_audit(
            db,
            user=owner,
            entity_type="client",
            entity_id=client.id,
            action=AuditAction.UPDATE,
            field_name="agent_commission_collected",
            old_value=client.agent_commission_collected,
            new_value=collected,
        )
        client.agent_commission_collected = collected
        client.agent_commission_collected_at = now if collected else None
        client.agent_commission_collected_by = owner.id if collected else None
        updated += 1
    db.commit()
    return updated
