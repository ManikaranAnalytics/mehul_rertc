from typing import Any

from sqlalchemy.orm import Session

from db.models import AppState, ScheduleRun

OPTIMIZER_CONFIG_KEY = "optimizer_config"
MULTIDAY_ANALYSIS_KEY = "multiday_analysis"
GENERATION_OVERRIDES_KEY = "generation_overrides"


def get_state(db: Session, key: str) -> dict[str, Any] | None:
    row = db.get(AppState, key)
    return row.data if row else None


def set_state(db: Session, key: str, data: dict[str, Any]) -> dict[str, Any]:
    row = db.get(AppState, key)
    if row is None:
        row = AppState(key=key, data=data)
        db.add(row)
    else:
        row.data = data
    db.commit()
    db.refresh(row)
    return row.data


def delete_state(db: Session, key: str) -> bool:
    row = db.get(AppState, key)
    if row is None:
        return False
    db.delete(row)
    db.commit()
    return True


def log_schedule_run(
    db: Session,
    date: str,
    request: dict[str, Any],
    response: dict[str, Any],
) -> None:
    db.add(ScheduleRun(date=date, request=request, response=response))
    db.commit()
