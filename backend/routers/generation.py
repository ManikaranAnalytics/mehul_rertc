from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session

from db.database import get_db
from models.schemas import GenerationPatchRequest
from services.forecast import generate_forecast
from services.generation_store import (
    build_template_csv,
    clear_july_generation_data,
    csv_solar_storage_mode,
    get_all_uploaded_as_edits,
    get_date_upload_meta,
    get_generation_for_date,
    get_generation_range,
    get_upload_meta_map,
    import_reference_csv_file,
    parse_generation_csv,
    patch_generation_blocks,
    scale_stored_solar_mw,
    upsert_generation_rows,
    validate_contract_date,
)

router = APIRouter()


@router.get("/generation/{date}")
def get_raw_generation(
    date: str,
    wtg_count: int = Query(10, ge=1, le=59),
    solar_ac_mw: float = Query(50.0, ge=5.0, le=175.0),
    db: Session = Depends(get_db),
):
    """
    Returns raw wind/solar generation (pre-PSP dispatch) for a date.
    Uses PostgreSQL uploads when present (scaled to solar_ac_mw); otherwise June reference forecast.
    """
    try:
        rows = get_generation_for_date(db, date)
        if any(r.get("has_upload") for r in rows):
            meta = get_date_upload_meta(db, date)
            from services.forecast import get_power_for_wind_speed
            records = []
            for row in rows:
                wind_speed = float(row["wind_speed"])
                power_kw = get_power_for_wind_speed(wind_speed)
                wind_mw = round((power_kw / 1000.0) * wtg_count, 4)
                if row.get("has_upload"):
                    solar_mw = scale_stored_solar_mw(float(row["solar_mw"]), solar_ac_mw, meta)
                else:
                    solar_mw = 0.0
                records.append({
                    "block": int(row["block"]),
                    "time": row["time"],
                    "wind_speed": round(wind_speed, 2),
                    "wind_mw_raw": wind_mw,
                    "wind_mw": wind_mw,
                    "solar_mw_raw": round(solar_mw, 4),
                    "solar_mw": round(solar_mw, 4),
                    "curtail_flag": False,
                    "curtail_partial_flag": False,
                    "curtail_max_mw": -1.0,
                })
            return records

        forecast_df = generate_forecast(
            date_str=date,
            wtg_count=wtg_count,
            solar_ac_mw=solar_ac_mw,
        )
        return forecast_df.to_dict(orient="records")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load raw generation: {str(e)}") from e


@router.get("/generation/db/range")
def get_generation_range_from_db(
    from_date: str = Query(..., alias="from"),
    to_date: str = Query(..., alias="to"),
    db: Session = Depends(get_db),
):
    """Returns uploaded generation data for a date range (zeros where not uploaded)."""
    data = get_generation_range(db, from_date, to_date)
    uploaded_dates = [d for d, rows in data.items() if any(r.get("has_upload") for r in rows)]
    return {
        "from": from_date,
        "to": to_date,
        "uploaded_dates": uploaded_dates,
        "data": data,
    }


@router.get("/generation/db/template")
def download_generation_template(
    from_date: str = Query(..., alias="from"),
    to_date: str = Query(..., alias="to"),
    db: Session = Depends(get_db),
):
    """Download CSV template for the filtered date range (uploaded values or zeros)."""
    csv_text = build_template_csv(db, from_date, to_date)
    filename = f"generation_input_{from_date}_to_{to_date}.csv"
    return PlainTextResponse(
        content=csv_text,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/generation/db/edits")
def get_generation_edits(db: Session = Depends(get_db)):
    """All uploaded generation data in multiDayGenEdits shape for optimizer sync."""
    return {
        "edits": get_all_uploaded_as_edits(db),
        "upload_meta": get_upload_meta_map(db),
    }


@router.post("/generation/db/upload")
async def upload_generation_csv(
    file: UploadFile = File(...),
    default_date: str | None = Query(None, description="Used when CSV has no date column"),
    solar_ac_mw: float = Query(60.0, ge=5.0, le=175.0, description="Solar AC MW for june_data.csv conversion"),
    db: Session = Depends(get_db),
):
    """Parse and store uploaded CSV into PostgreSQL."""
    if default_date:
        validate_contract_date(default_date)
    try:
        text = (await file.read()).decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise HTTPException(status_code=400, detail="File must be UTF-8 encoded CSV") from exc

    rows = parse_generation_csv(text, solar_ac_mw=solar_ac_mw)
    mode = csv_solar_storage_mode(text)
    result = upsert_generation_rows(
        db,
        rows,
        default_date=default_date,
        solar_ac_mw=solar_ac_mw,
        solar_mode=mode,
    )
    return {"status": "ok", **result}


@router.post("/generation/db/import-reference")
def import_june_reference_data(
    solar_ac_mw: float = Query(60.0, ge=5.0, le=175.0),
    db: Session = Depends(get_db),
):
    """Import data/june_data.csv from the server into PostgreSQL (June days → 2026 contract dates)."""
    import os
    file_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "june_data.csv")
    result = import_reference_csv_file(db, file_path, solar_ac_mw=solar_ac_mw)
    return {"status": "ok", "source": "data/june_data.csv", **result}


@router.delete("/generation/db")
def reset_generation_data(db: Session = Depends(get_db)):
    """Clear July generation uploads only; June data in PostgreSQL is kept."""
    deleted = clear_july_generation_data(db)
    return {"status": "ok", "rows_deleted": deleted, "scope": "july"}


@router.patch("/generation/db/{date}")
def patch_generation_for_date(
    date: str,
    body: GenerationPatchRequest,
    solar_ac_mw: float = Query(60.0, ge=5.0, le=175.0, description="Solar AC MW cap for stored solar_mw"),
    db: Session = Depends(get_db),
):
    """Persist inline edits from the Generation Input table (wind speed + solar MW per block)."""
    result = patch_generation_blocks(db, date, body.rows, solar_ac_mw=solar_ac_mw)
    return {"status": "ok", **result}


@router.get("/generation/db/{date}")
def get_generation_from_db(
    date: str,
    solar_ac_mw: float | None = Query(None, ge=5.0, le=175.0, description="Scale stored solar to this AC capacity"),
    db: Session = Depends(get_db),
):
    """Returns uploaded generation data for a date (zeros if not uploaded)."""
    validate_contract_date(date)
    rows = get_generation_for_date(db, date, solar_ac_mw=solar_ac_mw)
    has_upload = any(r.get("has_upload") for r in rows)
    return {"date": date, "has_upload": has_upload, "rows": rows}
