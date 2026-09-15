"""Рабочий день отдела считается по местному времени (UTC+3), а не по UTC."""

from datetime import date, datetime, time, timedelta, timezone

LOCAL_TZ = timezone(timedelta(hours=3))


def local_now() -> datetime:
    return datetime.now(LOCAL_TZ)


def local_today() -> date:
    return local_now().date()


def local_day_bounds(day: date) -> tuple[datetime, datetime]:
    """Границы местных суток, переведённые в UTC — в таком виде их сравнивают колонки created_at."""
    start = datetime.combine(day, time.min, tzinfo=LOCAL_TZ).astimezone(timezone.utc)
    return start, start + timedelta(days=1)
