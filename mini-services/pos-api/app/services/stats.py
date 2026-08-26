"""Stats service: thin wrapper around the stats repository.

Provides 9-hour business-day shift helpers and delegates to repositories.stats.
"""
from sqlalchemy.orm import Session

from ..repositories import orders as order_repo
from ..repositories import stats as stats_repo


def get_stats(db: Session, *, status: str | None = None, month: str | None = None,
              date: str | None = None) -> dict:
    main = order_repo.stats_filter(db, status=status, month=month, date=date)
    returned = order_repo.returned_filter(db, month=month, date=date)
    return {
        "revenue": round(main["revenue"], 2),
        "orders": main["orders"],
        "returnedCount": returned["returnedCount"],
        "returnedValue": round(returned["returnedValue"], 2),
    }


def get_summary_date(db: Session, *, month: str | None = None, scope: str = "month",
                     year: str | None = None) -> list[dict]:
    return stats_repo.summary_by_date(db, month=month, scope=scope, year=year)


def get_summary_category(db: Session, *, month: str | None = None) -> dict:
    return stats_repo.summary_by_category(db, month=month)
