"""Равное распределение удалённых менеджеров между кураторами.

Без зависимостей от моделей: этим же кодом пользуется миграция данных.
"""

from collections.abc import Hashable, Sequence
from typing import TypeVar

AgentKey = TypeVar("AgentKey", bound=Hashable)
CuratorKey = TypeVar("CuratorKey", bound=Hashable)


def plan_even_split(
    assignments: Sequence[tuple[AgentKey, CuratorKey | None]],
    curators: Sequence[CuratorKey],
) -> dict[AgentKey, CuratorKey]:
    """Новые кураторы для агентов, которых нужно переставить.

    Доли отличаются максимум на одного; лишний агент достаётся тем, у кого уже больше,
    поэтому переставляется как можно меньше людей. Порядок `assignments` — кого
    оставлять первым (обычно старшие по регистрации)."""
    if not curators:
        return {}
    total, count = len(assignments), len(curators)
    current: dict[CuratorKey, list[AgentKey]] = {curator: [] for curator in curators}
    for agent, curator in assignments:
        if curator in current:
            current[curator].append(agent)

    by_load = sorted(curators, key=lambda curator: -len(current[curator]))
    quota = {
        curator: total // count + (1 if index < total % count else 0)
        for index, curator in enumerate(by_load)
    }
    load = {curator: min(len(current[curator]), quota[curator]) for curator in curators}
    kept = {agent for curator in curators for agent in current[curator][: quota[curator]]}

    changes: dict[AgentKey, CuratorKey] = {}
    for agent, _ in assignments:
        if agent in kept:
            continue
        target = next(curator for curator in curators if load[curator] < quota[curator])
        changes[agent] = target
        load[target] += 1
    return changes
