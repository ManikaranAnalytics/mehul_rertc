from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from db.database import check_db_connection, get_db
from services.persistence import (
    GENERATION_OVERRIDES_KEY,
    MULTIDAY_ANALYSIS_KEY,
    OPTIMIZER_CONFIG_KEY,
    delete_state,
    get_state,
    set_state,
)

router = APIRouter(prefix="/state", tags=["Persistence"])

ALLOWED_KEYS = {
  OPTIMIZER_CONFIG_KEY,
  MULTIDAY_ANALYSIS_KEY,
  GENERATION_OVERRIDES_KEY,
}


class StatePayload(BaseModel):
    data: dict[str, Any]


@router.get("/health")
def db_health():
    connected = check_db_connection()
    return {
        "database": "postgresql",
        "connected": connected,
        "status": "ok" if connected else "unavailable",
    }


@router.get("/{key}")
def read_state(key: str, db: Session = Depends(get_db)):
    if key not in ALLOWED_KEYS:
        raise HTTPException(status_code=404, detail=f"Unknown state key: {key}")
    data = get_state(db, key)
    if data is None:
        return {"key": key, "data": None}
    return {"key": key, "data": data}


@router.put("/{key}")
def write_state(key: str, payload: StatePayload, db: Session = Depends(get_db)):
    if key not in ALLOWED_KEYS:
        raise HTTPException(status_code=404, detail=f"Unknown state key: {key}")
    saved = set_state(db, key, payload.data)
    return {"key": key, "data": saved}


@router.delete("/{key}")
def remove_state(key: str, db: Session = Depends(get_db)):
    if key not in ALLOWED_KEYS:
        raise HTTPException(status_code=404, detail=f"Unknown state key: {key}")
    deleted = delete_state(db, key)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"No data for key: {key}")
    return {"key": key, "deleted": True}
