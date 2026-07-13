from fastapi import APIRouter, HTTPException, Query, Depends
from fastapi.responses import Response
from sqlalchemy.orm import Session

from db.database import get_db
from models.schemas import ScheduleRequest
from routers.schedule import run_dispatch_pipeline
from services.constants import PSP_MAX_CAPACITY_MWH
from services.excel_export import build_excel

router = APIRouter()


def _curtailment_bounds(request: ScheduleRequest, active_segments: list) -> tuple[int, int, bool, str]:
    """Derive legacy Excel config labels from segment-based curtailment."""
    if request.curtailment_segments:
        segs = request.curtailment_segments
        starts = [s.startBlock for s in segs]
        ends = [s.endBlock for s in segs]
        label = ", ".join(f"B{s.startBlock}–{s.endBlock}" for s in segs)
        return min(starts), max(ends), True, label
    if active_segments:
        starts = [int(s["startBlock"]) for s in active_segments]
        ends = [int(s["endBlock"]) for s in active_segments]
        label = ", ".join(f"B{s['startBlock']}–{s['endBlock']}" for s in active_segments)
        return min(starts), max(ends), request.curtailment_enabled, label
    enabled = request.curtailment_enabled
    label = f"B{request.curtailment_start_block}–{request.curtailment_end_block}" if enabled else "DISABLED"
    return request.curtailment_start_block, request.curtailment_end_block, enabled, label


def _psp_curtailment_label(request: ScheduleRequest) -> str:
    if not request.psp_discharge_segments:
        return "None (global max discharge applies)"
    parts = []
    for seg in request.psp_discharge_segments:
        cap = seg.maxDischargeMw
        cap_txt = "blocked" if cap == 0 else f"cap {cap} MW"
        parts.append(f"B{seg.startBlock}–{seg.endBlock} ({cap_txt})")
    return "; ".join(parts)


def _build_excel_response(request: ScheduleRequest, db: Session) -> Response:
    forecast_df, dispatch, rtc_range, active_segments = run_dispatch_pipeline(request, db)
    curt_start, curt_end, curt_enabled, curt_label = _curtailment_bounds(request, active_segments)

    excel_bytes = build_excel(
        forecast_df=forecast_df,
        block_results=dispatch["blocks"],
        summary=dispatch["summary"],
        rtc_range=rtc_range,
        rtc_commitment=request.rtc_commitment_mw,
        wtg_count=request.wtg_count,
        solar_ac_mw=request.solar_ac_mw,
        date_str=request.date,
        initial_soc_mwh=request.initial_soc_mwh,
        curtailment_enabled=curt_enabled,
        curtailment_start_block=curt_start,
        curtailment_end_block=curt_end,
        curtailment_label=curt_label,
        psp_curtailment_label=_psp_curtailment_label(request),
        roundtrip_loss_pct=request.roundtrip_loss_pct,
        min_compliance_ratio=request.min_compliance_ratio,
        max_soc_mwh=request.max_soc_mwh,
        max_charge_mw=request.max_charge_mw,
        max_discharge_mw=request.max_discharge_mw,
        min_dispatch_mw=request.min_dispatch_mw,
        transmission_loss_pct=request.transmission_loss_pct,
        discharge_target=request.discharge_target,
    )

    filename = (
        f"RTC_Dispatch_{request.date}_WTG{request.wtg_count}"
        f"_Solar{int(request.solar_ac_mw)}MW.xlsx"
    )
    return Response(
        content=excel_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/export/excel")
def export_excel_post(request: ScheduleRequest, db: Session = Depends(get_db)):
    """
    Excel export using the same inputs as POST /api/schedule (uploaded generation,
    curtailment segments, PSP discharge curtailment, carry-forward SoC, etc.).
    """
    try:
        return _build_excel_response(request, db)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Excel export failed: {str(e)}") from e


@router.get("/export/excel")
def export_excel_get(
    date: str = Query("2026-06-01"),
    wtg_count: int = Query(15, ge=1, le=59),
    solar_ac_mw: float = Query(60.0, ge=5.0, le=175.0),
    rtc_commitment_mw: float = Query(15.0, ge=1.0, le=300.0),
    initial_soc_mwh: float = Query(0.0, ge=0.0, le=PSP_MAX_CAPACITY_MWH),
    db: Session = Depends(get_db),
):
    """Legacy GET export — loads generation overrides from PostgreSQL for the date."""
    request = ScheduleRequest(
        date=date,
        wtg_count=wtg_count,
        solar_ac_mw=solar_ac_mw,
        rtc_commitment_mw=rtc_commitment_mw,
        initial_soc_mwh=initial_soc_mwh,
        curtailment_enabled=False,
        curtailment_segments=None,
    )
    try:
        return _build_excel_response(request, db)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Excel export failed: {str(e)}") from e
