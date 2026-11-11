"""Рейтинг удалённых менеджеров.

Баллы только за то, что подделать нельзя: клиент пришёл в офис — 1 балл,
договор с первым платежом — ещё 5. Первое место месяца получает значок
«Лучший месяца» и премию; премия фиксируется после окончания месяца и идёт
в выплаты агентам наравне с вознаграждением за клиентов.
"""

from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.time import local_today, to_local_date
from app.models.agent_award import AgentAward
from app.models.client import MANAGER_FIRST_COMMISSION_SINCE, Client
from app.models.enums import AuditAction, UserRole
from app.models.user import User
from app.schemas.agent import (
    AgentAwardItem,
    AgentAwardWinner,
    AgentRanking,
    AgentRankingEntry,
    AgentRankingMe,
    RankingPeriod,
)
from app.services.audit import log_audit
from app.services.manager_first_commissions import (
    contract_client_filters,
    first_payment_dates_subquery,
)
from app.services.notifications import notify
from app.services.phone import month_bounds

POINTS_VISIT = 1
POINTS_CONTRACT = 5
MONTHLY_BONUS = Decimal("30000.00")
# Премия за месяц, в котором у лидера был хотя бы один договор с первым платежом.
BONUS_MIN_CONTRACTS = 1
# Премии начисляются с месяца запуска рейтинга, прошлые месяцы не пересчитываем.
AWARDS_SINCE = "2026-11"
RATING_LINK = "/agent/rating"
WINNERS_LIMIT = 12

_MONTHS = (
    "январь", "февраль", "март", "апрель", "май", "июнь",
    "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь",
)


def month_key(day) -> str:
    return f"{day.year:04d}-{day.month:02d}"


def month_label(month: str) -> str:
    year, number = month.split("-")
    return f"{_MONTHS[int(number) - 1]} {year}"


def points_label(points: int) -> str:
    tail = points % 100
    if 11 <= tail <= 14:
        word = "баллов"
    elif points % 10 == 1:
        word = "балл"
    elif 2 <= points % 10 <= 4:
        word = "балла"
    else:
        word = "баллов"
    return f"{points} {word}"


def money_label(amount: Decimal) -> str:
    return f"{amount:,.0f}".replace(",", " ") + " ₽"


def rating_name(full_name: str) -> str:
    """«Юнусов Магомед Русланович» → «Магомед Ю.»: другим агентам — без полной фамилии."""
    parts = full_name.split()
    if len(parts) < 2:
        return full_name.strip() or "—"
    return f"{parts[1]} {parts[0][0]}."


def earned_clients_stmt(organization_id: UUID):
    """Клиенты агентов с первым платежом: за них выплата уже заработана."""
    first_paid = first_payment_dates_subquery()
    return first_paid, (
        select(Client, first_paid.c.first_payment_date)
        .join(first_paid, first_paid.c.client_id == Client.id)
        .where(
            *contract_client_filters(organization_id),
            Client.source_agent_id.is_not(None),
            first_paid.c.first_payment_date >= MANAGER_FIRST_COMMISSION_SINCE,
        )
    )


@dataclass
class _Event:
    agent_id: UUID
    points: int
    is_contract: bool
    day: object


@dataclass
class _Score:
    agent_id: UUID
    points: int = 0
    visits: int = 0
    contracts: int = 0
    reached: object = None


def _events(db: Session, organization_id: UUID) -> list[_Event]:
    db.flush()
    events = [
        _Event(agent_id, POINTS_VISIT, False, to_local_date(created_at))
        for agent_id, created_at in db.execute(
            select(Client.source_agent_id, Client.created_at).where(
                Client.organization_id == organization_id,
                Client.source_agent_id.is_not(None),
                Client.is_deleted.is_(False),
            )
        )
    ]
    _, stmt = earned_clients_stmt(organization_id)
    events.extend(
        _Event(client.source_agent_id, POINTS_CONTRACT, True, first_payment_date)
        for client, first_payment_date in db.execute(stmt)
    )
    return events


def _rank(events: list[_Event], month: str | None) -> list[_Score]:
    """Места по баллам; при равенстве — больше договоров, затем кто набрал раньше."""
    scores: dict[UUID, _Score] = {}
    for event in events:
        if month is not None and month_key(event.day) != month:
            continue
        score = scores.setdefault(event.agent_id, _Score(event.agent_id))
        score.points += event.points
        if event.is_contract:
            score.contracts += 1
        else:
            score.visits += 1
        if score.reached is None or event.day > score.reached:
            score.reached = event.day
    return sorted(
        (score for score in scores.values() if score.points > 0),
        key=lambda score: (-score.points, -score.contracts, score.reached),
    )


def ensure_month_awards(
    db: Session, organization_id: UUID, events: list[_Event] | None = None
) -> None:
    """Фиксирует лучшего за каждый завершившийся месяц (один раз)."""
    if events is None:
        events = _events(db, organization_id)
    current = month_key(local_today())
    months = sorted(
        month for month in {month_key(event.day) for event in events} if AWARDS_SINCE <= month < current
    )
    if not months:
        return
    awarded = set(
        db.scalars(select(AgentAward.month).where(AgentAward.organization_id == organization_id))
    )
    for month in months:
        if month in awarded:
            continue
        scores = _rank(events, month)
        if not scores or scores[0].contracts < BONUS_MIN_CONTRACTS:
            continue
        winner = scores[0]
        db.add(
            AgentAward(
                organization_id=organization_id,
                agent_id=winner.agent_id,
                month=month,
                points=winner.points,
                amount=MONTHLY_BONUS,
            )
        )
        notify(
            db,
            recipient_ids=[winner.agent_id],
            organization_id=organization_id,
            kind="agent_award",
            title="Вы — лучший удалённый менеджер месяца!",
            body=(
                f"{month_label(month).capitalize()}: {points_label(winner.points)}. "
                f"Премия {money_label(MONTHLY_BONUS)} — офис свяжется с вами о выплате."
            ),
            link=RATING_LINK,
        )


def sync_agent_ranking(db: Session, organization_id: UUID) -> None:
    """Пересчёт мест текущего месяца и уведомления «вы поднялись» / «вас обогнали»."""
    events = _events(db, organization_id)
    ensure_month_awards(db, organization_id, events)

    month = month_key(local_today())
    scores = _rank(events, month)
    places = {score.agent_id: index + 1 for index, score in enumerate(scores)}
    points = {score.agent_id: score.points for score in scores}
    agents = list(
        db.scalars(
            select(User).where(User.organization_id == organization_id, User.role == UserRole.AGENT)
        )
    )
    old_places = {
        agent.id: agent.rank_place for agent in agents if agent.rank_month == month
    }
    names = {agent.id: rating_name(agent.full_name) for agent in agents}

    for agent in agents:
        new = places.get(agent.id)
        old = old_places.get(agent.id)
        if new is not None and new != old:
            if old is None or new < old:
                title = (
                    "Вы лидер рейтинга месяца!"
                    if new == 1
                    else f"Вы поднялись на {new} место в рейтинге"
                )
                body = f"У вас {points_label(points[agent.id])} за {month_label(month)}."
                kind = "rank_up"
            else:
                passers = [
                    names[other_id]
                    for other_id, place in places.items()
                    if place < new
                    and other_id != agent.id
                    and (old_places.get(other_id) is None or old_places[other_id] > old)
                ]
                ahead = scores[new - 2]
                gap = ahead.points - points[agent.id] + 1
                title = f"Вас обогнали — теперь вы на {new} месте"
                body = (
                    f"Впереди теперь {', '.join(passers) or 'другой менеджер'}. "
                    f"До {new - 1} места — {points_label(gap)}."
                )
                kind = "rank_down"
            notify(
                db,
                recipient_ids=[agent.id],
                organization_id=organization_id,
                kind=kind,
                title=title,
                body=body,
                link=RATING_LINK,
                collapse=True,
            )
        agent.rank_month = month
        agent.rank_place = new


def sync_agent_ranking_for_client(db: Session, client: Client) -> None:
    if client.source_agent_id is not None:
        sync_agent_ranking(db, client.organization_id)


def get_agent_ranking(db: Session, user: User, period: RankingPeriod) -> AgentRanking:
    sync_agent_ranking(db, user.organization_id)
    db.commit()

    events = _events(db, user.organization_id)
    month = month_key(local_today())
    scores = _rank(events, month if period == "month" else None)

    awards = list(
        db.scalars(
            select(AgentAward)
            .where(AgentAward.organization_id == user.organization_id)
            .order_by(AgentAward.month.desc())
        )
    )
    wins: dict[UUID, int] = {}
    for award in awards:
        wins[award.agent_id] = wins.get(award.agent_id, 0) + 1
    agent_ids = {score.agent_id for score in scores} | {award.agent_id for award in awards}
    names = {
        agent.id: rating_name(agent.full_name)
        for agent in db.scalars(select(User).where(User.id.in_(agent_ids)))
    } if agent_ids else {}

    entries = [
        AgentRankingEntry(
            place=index + 1,
            name=names.get(score.agent_id, "—"),
            points=score.points,
            visits=score.visits,
            contracts=score.contracts,
            wins=wins.get(score.agent_id, 0),
            is_me=score.agent_id == user.id,
        )
        for index, score in enumerate(scores)
    ]

    me = None
    if user.role == UserRole.AGENT:
        mine = next((entry for entry in entries if entry.is_me), None)
        if mine is None:
            me = AgentRankingMe(place=None, points=0, gap_to_next=None)
        else:
            gap = entries[mine.place - 2].points - mine.points + 1 if mine.place > 1 else None
            me = AgentRankingMe(place=mine.place, points=mine.points, gap_to_next=gap)

    return AgentRanking(
        period=period,
        month=month,
        points_visit=POINTS_VISIT,
        points_contract=POINTS_CONTRACT,
        bonus_amount=MONTHLY_BONUS,
        bonus_min_contracts=BONUS_MIN_CONTRACTS,
        entries=entries,
        me=me,
        winners=[
            AgentAwardWinner(
                month=award.month,
                name=names.get(award.agent_id, "—"),
                points=award.points,
                is_me=award.agent_id == user.id,
            )
            for award in awards[:WINNERS_LIMIT]
        ],
    )


# --- Премии в выплатах ---------------------------------------------------------


def award_totals(
    db: Session, organization_id: UUID, agent_ids: list[UUID]
) -> dict[UUID, tuple[Decimal, Decimal]]:
    """agent_id → (начислено премий, выплачено премий)."""
    totals: dict[UUID, tuple[Decimal, Decimal]] = {}
    if not agent_ids:
        return totals
    for award in db.scalars(
        select(AgentAward).where(
            AgentAward.organization_id == organization_id,
            AgentAward.agent_id.in_(agent_ids),
        )
    ):
        earned, paid = totals.get(award.agent_id, (Decimal("0.00"), Decimal("0.00")))
        totals[award.agent_id] = (
            earned + award.amount,
            paid + (award.amount if award.paid_at is not None else Decimal("0.00")),
        )
    return totals


def month_award_items(db: Session, organization_id: UUID, month: str) -> list[AgentAwardItem]:
    ensure_month_awards(db, organization_id)
    db.commit()
    return [
        AgentAwardItem(
            id=award.id,
            month=award.month,
            agent_id=award.agent_id,
            agent_name=award.agent.full_name,
            inn=award.agent.inn,
            points=award.points,
            amount=award.amount,
            paid=award.paid_at is not None,
            paid_at=award.paid_at,
        )
        for award in db.scalars(
            select(AgentAward).where(
                AgentAward.organization_id == organization_id,
                AgentAward.month == month,
            )
        )
    ]


def unpaid_awards_total(db: Session, organization_id: UUID) -> Decimal:
    return sum(
        db.scalars(
            select(AgentAward.amount).where(
                AgentAward.organization_id == organization_id,
                AgentAward.paid_at.is_(None),
            )
        ),
        Decimal("0.00"),
    )


def set_award_paid(db: Session, owner: User, award_id: UUID, paid: bool) -> AgentAward:
    award = db.scalar(
        select(AgentAward).where(
            AgentAward.id == award_id,
            AgentAward.organization_id == owner.organization_id,
        )
    )
    if award is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Премия не найдена")
    if (award.paid_at is not None) != paid:
        log_audit(
            db,
            user=owner,
            entity_type="agent_award",
            entity_id=award.id,
            action=AuditAction.UPDATE,
            field_name="paid",
            old_value=award.paid_at is not None,
            new_value=paid,
        )
        award.paid_at = datetime.now(timezone.utc) if paid else None
        award.paid_by = owner.id if paid else None
    db.commit()
    return award
