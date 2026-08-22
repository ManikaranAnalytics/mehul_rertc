"""PostgreSQL-backed generation input storage (CSV uploads)."""

from __future__ import annotations

import csv
import io
import os
import re
from datetime import date, timedelta
from typing import Any

from fastapi import HTTPException
from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from db.models import GenerationInput, GenerationUploadMeta
from services.constants import (
    CONTRACT_END_DATE,
    CONTRACT_START_DATE,
    JULY_END_DATE,
    JULY_START_DATE,
)
from services.forecast import compute_scaled_solar_mw, get_power_for_wind_speed
from services.persistence import GENERATION_UPLOAD_META_KEY, delete_state, get_state

BLOCK_TIMES = [
    f"{h:02d}:{m:02d}:00"
    for h in range(24)
    for m in (0, 15, 30, 45)
]

DEFAULT_SOLAR_AC_MW = 60.0


def _legacy_upload_meta_from_app_state(db: Session) -> dict[str, dict[str, Any]]:
    return dict(get_state(db, GENERATION_UPLOAD_META_KEY) or {})


def _migrate_legacy_upload_meta(db: Session) -> None:
    """One-time move from app_state JSON blob to generation_upload_meta table."""
    legacy = _legacy_upload_meta_from_app_state(db)
    if not legacy:
        return
    for date_str, entry in legacy.items():
        try:
            validate_contract_date(date_str)
        except HTTPException:
            continue
        solar_ac = float(entry.get("solar_ac_mw") or DEFAULT_SOLAR_AC_MW)
        mode = str(entry.get("mode") or "absolute")
        stmt = insert(GenerationUploadMeta).values(
            date=date_str,
            solar_ac_mw=solar_ac,
            solar_mode=mode,
        )
        stmt = stmt.on_conflict_do_update(
            index_elements=["date"],
            set_={
                "solar_ac_mw": stmt.excluded.solar_ac_mw,
                "solar_mode": stmt.excluded.solar_mode,
            },
        )
        db.execute(stmt)
    db.commit()
    delete_state(db, GENERATION_UPLOAD_META_KEY)


def get_upload_meta_map(db: Session) -> dict[str, dict[str, Any]]:
    """Per-date upload metadata persisted in PostgreSQL (survives redeploys)."""
    rows = db.scalars(select(GenerationUploadMeta)).all()
    if not rows:
        _migrate_legacy_upload_meta(db)
        rows = db.scalars(select(GenerationUploadMeta)).all()
    return {
        r.date: {"solar_ac_mw": float(r.solar_ac_mw), "mode": r.solar_mode}
        for r in rows
    }


def get_date_upload_meta(db: Session, for_date: str) -> dict[str, Any] | None:
    row = db.get(GenerationUploadMeta, for_date)
    if row is not None:
        return {"solar_ac_mw": float(row.solar_ac_mw), "mode": row.solar_mode}
    legacy = _legacy_upload_meta_from_app_state(db)
    if for_date in legacy:
        return legacy[for_date]
    return None


def set_upload_meta_for_dates(
    db: Session,
    dates: list[str],
    *,
    solar_ac_mw: float,
    mode: str,
    commit: bool = True,
) -> None:
    """Record how solar_mw was stored for each uploaded date (absolute MW or 175 MW reference base)."""
    for d in dates:
        validate_contract_date(d)
        stmt = insert(GenerationUploadMeta).values(
            date=d,
            solar_ac_mw=float(solar_ac_mw),
            solar_mode=mode,
        )
        stmt = stmt.on_conflict_do_update(
            index_elements=["date"],
            set_={
                "solar_ac_mw": stmt.excluded.solar_ac_mw,
                "solar_mode": stmt.excluded.solar_mode,
            },
        )
        db.execute(stmt)
    if commit:
        db.commit()


def scale_stored_solar_mw(
    stored_solar: float,
    solar_ac_mw: float,
    meta: dict[str, Any] | None,
) -> float:
    """
    Scale stored solar to the requested Solar Net Capacity.

    - reference: stored value is max(solar_2024, solar_2025) from june_data-style CSV
    - absolute: stored value is MW at upload-time solar_ac_mw (scale proportionally)
    """
    if stored_solar <= 0 or solar_ac_mw <= 0:
        return 0.0

    mode = (meta or {}).get("mode", "absolute")
    if mode == "reference":
        return compute_scaled_solar_mw(stored_solar, solar_ac_mw)

    upload_ac = float((meta or {}).get("solar_ac_mw") or DEFAULT_SOLAR_AC_MW)
    if upload_ac <= 0:
        upload_ac = DEFAULT_SOLAR_AC_MW
    scaled = stored_solar * (solar_ac_mw / upload_ac)
    return min(scaled, solar_ac_mw)


def _apply_upload_wind_speed_correction(speed: float) -> float:
    """Direct passthrough: no artificial multiplier/correction factor applied during CSV upload."""
    return round(speed, 4)


def _parse_iso_date(value: str) -> date:
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid date: {value}") from exc


def normalize_upload_date(value: str) -> str:
    """Map assorted date formats to contract window ISO dates (2026-06-01 to 2027-03-31)."""
    raw = value.strip()
    if not raw:
        raise HTTPException(status_code=400, detail="Empty date value")

    # ISO: 2024-06-01, 2026-06-01, or 2027-01-15
    if re.match(r"^\d{4}-\d{2}-\d{2}", raw):
        parsed = date.fromisoformat(raw[:10])
        if parsed.year < 2026:
            target_year = 2026 if parsed.month >= 6 else 2027
            normalized = date(target_year, parsed.month, parsed.day)
            return normalized.isoformat()
        return parsed.isoformat()

    # DD/MM/YY or DD/MM/YYYY or DD-MM-YY
    parts = re.split(r"[/\-]", raw)
    if len(parts) == 3:
        try:
            day = int(parts[0])
            month = int(parts[1])
            year = int(parts[2])
            if year < 100:
                year += 2000
            if year < 2026:
                target_year = 2026 if month >= 6 else 2027
                normalized = date(target_year, month, day)
                return normalized.isoformat()
            normalized = date(year, month, day)
            return normalized.isoformat()
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=f"Invalid date: {value}") from exc

    raise HTTPException(
        status_code=400,
        detail=f"Invalid date: {value}. Use YYYY-MM-DD or DD/MM/YY (e.g. 2026-06-01 or 15/01/27).",
    )


def validate_contract_date(value: str) -> str:
    normalized = normalize_upload_date(value)
    d = _parse_iso_date(normalized)
    start = _parse_iso_date(CONTRACT_START_DATE)
    end = _parse_iso_date(CONTRACT_END_DATE)
    if d < start or d > end:
        raise HTTPException(
            status_code=400,
            detail=f"Date {normalized} is outside contract window ({CONTRACT_START_DATE} to {CONTRACT_END_DATE})",
        )
    return normalized


def iter_contract_dates(from_date: str, to_date: str) -> list[str]:
    start = _parse_iso_date(validate_contract_date(from_date))
    end = _parse_iso_date(validate_contract_date(to_date))
    if start > end:
        raise HTTPException(status_code=400, detail='"from" must be on or before "to"')
    dates: list[str] = []
    current = start
    while current <= end:
        dates.append(current.isoformat())
        current += timedelta(days=1)
    return dates


def _zero_rows(for_date: str) -> list[dict[str, Any]]:
    return [
        {
            "date": for_date,
            "block": block,
            "time": BLOCK_TIMES[block - 1],
            "wind_speed": 0.0,
            "solar_mw": 0.0,
            "has_upload": False,
        }
        for block in range(1, 97)
    ]


def _normalize_header(value: str) -> str:
    return value.strip().lower().replace(" ", "_")


def _find_col(headers: list[str], matchers: list[str]) -> int:
    for i, header in enumerate(headers):
        for matcher in matchers:
            if matcher in header:
                return i
    return -1


def _find_exact_col(headers: list[str], name: str) -> int:
    return next((i for i, h in enumerate(headers) if h == name), -1)


def _is_june_reference_format(headers: list[str]) -> bool:
    return (
        _find_exact_col(headers, "wind_speed_2024") >= 0
        and _find_exact_col(headers, "wind_speed_2025") >= 0
    )


def parse_june_reference_csv(text: str, solar_ac_mw: float = DEFAULT_SOLAR_AC_MW) -> list[dict[str, Any]]:
    """Convert data/june_data.csv style reference file into generation upload rows."""
    reader = csv.reader(io.StringIO(text.strip()))
    rows = list(reader)
    if not rows:
        return []

    headers = [_normalize_header(h) for h in rows[0]]
    if not _is_june_reference_format(headers):
        return []

    date_idx = _find_col(headers, ["date"])
    block_idx = _find_exact_col(headers, "block")
    wind_2024_idx = _find_exact_col(headers, "wind_speed_2024")
    wind_2025_idx = _find_exact_col(headers, "wind_speed_2025")
    solar_2024_idx = _find_exact_col(headers, "solar_2024")
    solar_2025_idx = _find_exact_col(headers, "solar_2025")

    parsed: list[dict[str, Any]] = []
    for cells in rows[1:]:
        if not cells or block_idx < 0 or date_idx < 0:
            continue
        try:
            block = int(float(cells[block_idx]))
        except (ValueError, IndexError):
            continue
        if block < 1 or block > 96:
            continue

        row_date = validate_contract_date(cells[date_idx].strip())

        try:
            ws2024 = float(cells[wind_2024_idx]) if wind_2024_idx < len(cells) else 0.0
            ws2025 = float(cells[wind_2025_idx]) if wind_2025_idx < len(cells) else 0.0
            solar_2024 = float(cells[solar_2024_idx]) if solar_2024_idx < len(cells) else 0.0
            solar_2025 = float(cells[solar_2025_idx]) if solar_2025_idx < len(cells) else 0.0
        except ValueError:
            continue

        projected_speed = 0.8 * ws2025 + 0.2 * ws2024
        wind_speed = _apply_upload_wind_speed_correction(projected_speed)
        solar_mw = max(solar_2024, solar_2025, 0.0)

        parsed.append({
            "date": row_date,
            "block": block,
            "time": BLOCK_TIMES[block - 1],
            "wind_speed": round(wind_speed, 4),
            "solar_mw": round(solar_mw, 4),
        })

    return parsed


def parse_generation_csv(text: str, solar_ac_mw: float = DEFAULT_SOLAR_AC_MW) -> list[dict[str, Any]]:
    # Auto-detect june_data.csv / wind_speed reference format
    june_rows = parse_june_reference_csv(text, solar_ac_mw=solar_ac_mw)
    if june_rows:
        return june_rows

    reader = csv.reader(io.StringIO(text.strip()))
    rows = list(reader)
    if not rows:
        return []

    headers = [_normalize_header(h) for h in rows[0]]
    has_header = any("block" in h or "wind" in h or "solar" in h for h in headers)
    data_rows = rows[1:] if has_header else rows
    if not has_header:
        headers = ["block", "wind_speed", "solar_mw"]

    block_idx = _find_col(headers, ["block", "tb", "time_block"])
    wind_idx = _find_exact_col(headers, "wind_speed")
    if wind_idx < 0:
        wind_idx = _find_col(headers, ["wind_speed_ms", "ws"])
    solar_idx = _find_exact_col(headers, "solar_mw")
    if solar_idx < 0:
        solar_idx = _find_col(headers, ["solar_gen", "solar_generation"])
    date_idx = _find_col(headers, ["date", "simulation_date", "sim_date"])

    resolved_block = block_idx if block_idx >= 0 else (1 if date_idx >= 0 else 0)
    resolved_wind = wind_idx if wind_idx >= 0 else (2 if date_idx >= 0 else 1)
    resolved_solar = solar_idx if solar_idx >= 0 else (3 if date_idx >= 0 else 2)

    parsed: list[dict[str, Any]] = []
    for cells in data_rows:
        if not cells:
            continue
        try:
            block = int(float(cells[resolved_block]))
        except (ValueError, IndexError):
            continue
        if block < 1 or block > 96:
            continue

        row_date = None
        if date_idx >= 0 and date_idx < len(cells) and cells[date_idx].strip():
            row_date = validate_contract_date(cells[date_idx].strip())

        wind_val = None
        solar_val = None
        if resolved_wind < len(cells) and cells[resolved_wind].strip():
            try:
                wind_val = float(cells[resolved_wind])
            except ValueError:
                pass
        if resolved_solar < len(cells) and cells[resolved_solar].strip():
            try:
                solar_val = float(cells[resolved_solar])
            except ValueError:
                pass

        if wind_val is None and solar_val is None:
            continue

        wind_speed = _apply_upload_wind_speed_correction(wind_val) if wind_val is not None else 0.0

        parsed.append({
            "date": row_date,
            "block": block,
            "time": BLOCK_TIMES[block - 1],
            "wind_speed": wind_speed,
            "solar_mw": max(solar_val, 0.0) if solar_val is not None else 0.0,
        })

    return parsed


def import_reference_csv_file(
    db: Session,
    file_path: str,
    solar_ac_mw: float = DEFAULT_SOLAR_AC_MW,
) -> dict[str, int]:
    if not os.path.isfile(file_path):
        raise HTTPException(status_code=404, detail=f"Reference file not found: {file_path}")
    with open(file_path, encoding="utf-8-sig") as f:
        text = f.read()
    rows = parse_generation_csv(text, solar_ac_mw=solar_ac_mw)
    if not rows:
        raise HTTPException(status_code=400, detail="No valid rows found in reference file")
    return upsert_generation_rows(
        db,
        rows,
        solar_ac_mw=solar_ac_mw,
        solar_mode="reference",
    )


def patch_generation_blocks(
    db: Session,
    for_date: str,
    rows: list,
    solar_ac_mw: float = DEFAULT_SOLAR_AC_MW,
) -> dict[str, int]:
    """Upsert one or more blocks for a date (used by inline cell edits on Generation Input)."""
    validate_contract_date(for_date)
    if not rows:
        return {"rows_upserted": 0, "dates_updated": 0}

    payload: list[dict[str, Any]] = []
    for row in rows:
        block = int(row.block if hasattr(row, "block") else row["block"])
        if block < 1 or block > 96:
            continue
        wind_speed = float(row.wind_speed if hasattr(row, "wind_speed") else row["wind_speed"])
        solar_raw = float(row.solar_mw if hasattr(row, "solar_mw") else row["solar_mw"])
        payload.append({
            "date": for_date,
            "block": block,
            "time": BLOCK_TIMES[block - 1],
            "wind_speed": max(wind_speed, 0.0),
            "solar_mw": min(max(solar_raw, 0.0), solar_ac_mw),
        })

    if not payload:
        return {"rows_upserted": 0, "dates_updated": 0}

    result = upsert_generation_rows(
        db,
        payload,
        solar_ac_mw=solar_ac_mw,
        solar_mode="absolute",
    )
    return result


def upsert_generation_rows(
    db: Session,
    rows: list[dict[str, Any]],
    default_date: str | None = None,
    *,
    solar_ac_mw: float | None = None,
    solar_mode: str | None = None,
) -> dict[str, int]:
    if not rows:
        raise HTTPException(status_code=400, detail="No valid rows found in upload")

    by_date: dict[str, list[dict[str, Any]]] = {}
    for row in rows:
        row_date = row.get("date") or default_date
        if not row_date:
            raise HTTPException(status_code=400, detail="CSV must include a date column for multi-day uploads")
        validate_contract_date(row_date)
        by_date.setdefault(row_date, []).append(row)

    total = 0
    for row_date, day_rows in by_date.items():
        values = [
            {
                "date": row_date,
                "block": int(r["block"]),
                "time": r.get("time") or BLOCK_TIMES[int(r["block"]) - 1],
                "wind_speed": float(r.get("wind_speed") or 0.0),
                "solar_mw": float(r.get("solar_mw") or 0.0),
            }
            for r in day_rows
        ]
        stmt = insert(GenerationInput).values(values)
        stmt = stmt.on_conflict_do_update(
            index_elements=["date", "block"],
            set_={
                "time": stmt.excluded.time,
                "wind_speed": stmt.excluded.wind_speed,
                "solar_mw": stmt.excluded.solar_mw,
            },
        )
        db.execute(stmt)
        total += len(values)

    if solar_ac_mw is not None and solar_mode is not None:
        set_upload_meta_for_dates(
            db,
            list(by_date.keys()),
            solar_ac_mw=solar_ac_mw,
            mode=solar_mode,
            commit=False,
        )

    db.commit()

    return {"rows_upserted": total, "dates_updated": len(by_date), "persisted": True}


def get_generation_for_date(
    db: Session,
    for_date: str,
    solar_ac_mw: float | None = None,
) -> list[dict[str, Any]]:
    validate_contract_date(for_date)
    meta = get_date_upload_meta(db, for_date) if solar_ac_mw is not None else None
    rows = db.scalars(
        select(GenerationInput)
        .where(GenerationInput.date == for_date)
        .order_by(GenerationInput.block)
    ).all()

    if not rows:
        return _zero_rows(for_date)

    by_block = {r.block: r for r in rows}
    result: list[dict[str, Any]] = []
    for block in range(1, 97):
        row = by_block.get(block)
        stored_solar = float(row.solar_mw) if row else 0.0
        display_solar = (
            scale_stored_solar_mw(stored_solar, solar_ac_mw, meta)
            if solar_ac_mw is not None and row is not None
            else stored_solar
        )
        result.append({
            "date": for_date,
            "block": block,
            "time": row.time if row else BLOCK_TIMES[block - 1],
            "wind_speed": float(row.wind_speed) if row else 0.0,
            "solar_mw": display_solar,
            "has_upload": row is not None,
        })
    return result


def get_generation_range(db: Session, from_date: str, to_date: str) -> dict[str, list[dict[str, Any]]]:
    dates = iter_contract_dates(from_date, to_date)
    return {d: get_generation_for_date(db, d) for d in dates}


def build_template_csv(db: Session, from_date: str, to_date: str) -> str:
    data = get_generation_range(db, from_date, to_date)
    lines = ["date,block,time,wind_speed,solar_mw"]
    for d in sorted(data.keys()):
        for row in data[d]:
            time_short = row["time"][:5] if row["time"] else "00:00"
            lines.append(
                f"{d},{row['block']},{time_short},{row['wind_speed']:.2f},{row['solar_mw']:.3f}"
            )
    return "\n".join(lines) + "\n"


def block_overrides_from_db(
    db: Session,
    for_date: str,
    wtg_count: int,
    solar_ac_mw: float = DEFAULT_SOLAR_AC_MW,
) -> list[dict[str, Any]]:
    """Build schedule block_overrides from PostgreSQL generation_inputs.

    Solar MW is scaled to the requested solar_ac_mw using the stored upload
    metadata (absolute ratio or 175 MW reference base).
    """
    rows = get_generation_for_date(db, for_date, solar_ac_mw=solar_ac_mw)
    if not any(r.get("has_upload") for r in rows):
        return []

    overrides: list[dict[str, Any]] = []
    for row in rows:
        if not row.get("has_upload"):
            continue
        wind_speed = float(row["wind_speed"])
        power_kw = get_power_for_wind_speed(wind_speed)
        wind_mw = round((power_kw / 1000.0) * wtg_count, 4)
        overrides.append({
            "block": int(row["block"]),
            "wind_mw": wind_mw,
            "solar_mw": float(row["solar_mw"]),  # already scaled by get_generation_for_date
        })
    return overrides


def get_all_uploaded_as_edits(db: Session) -> dict[str, dict[str, dict[str, str]]]:
    """Return multiDayGenEdits-shaped dict from all uploaded rows."""
    rows = db.scalars(select(GenerationInput).order_by(GenerationInput.date, GenerationInput.block)).all()
    result: dict[str, dict[str, dict[str, str]]] = {}
    for row in rows:
        day = result.setdefault(row.date, {})
        day[str(row.block)] = {
            "wind_speed": str(row.wind_speed),
            "solar_mw": str(row.solar_mw),
        }
    return result


def clear_july_generation_data(db: Session) -> int:
    """Remove uploaded generation rows for July only; June data is preserved."""
    result = db.execute(
        delete(GenerationInput).where(
            GenerationInput.date >= JULY_START_DATE,
            GenerationInput.date <= JULY_END_DATE,
        )
    )
    db.execute(
        delete(GenerationUploadMeta).where(
            GenerationUploadMeta.date >= JULY_START_DATE,
            GenerationUploadMeta.date <= JULY_END_DATE,
        )
    )
    db.commit()
    return result.rowcount or 0


def csv_solar_storage_mode(text: str) -> str:
    """Detect whether uploaded CSV stores solar as 175 MW reference base or absolute MW."""
    reader = csv.reader(io.StringIO(text.strip()))
    rows = list(reader)
    if not rows:
        return "absolute"
    headers = [_normalize_header(h) for h in rows[0]]
    return "reference" if _is_june_reference_format(headers) else "absolute"
