import os

import pandas as pd
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from models.schemas import (
    ScheduleRequest, ScheduleResponse,
    MaxRTCRequest, MaxRTCResponse,
    RTCRangeRequest, RTCRangeResponse,
    MultiDayMaxRTCRequest, MultiDayMaxRTCResponse,
)
from db.database import get_db
from services.forecast import generate_forecast, apply_curtailment_to_dataframe, resolve_active_segments
from services.generation_store import block_overrides_from_db, get_date_upload_meta, scale_stored_solar_mw
from services.generation_store import DEFAULT_SOLAR_AC_MW
from services.psp_optimizer import optimize_psp_dispatch, find_max_rtc_no_shortfall, calculate_rtc_range, find_max_rtc_multiday

router = APIRouter()


@router.get("/health", tags=["Health"])
def health_check():
    """Lightweight liveness probe for Docker / load-balancer health checks."""
    return {
        "status": "ok",
        "git_commit": os.getenv("GIT_COMMIT", "unknown"),
    }


def _resolve_upload_meta(db: Session | None, for_date: str) -> dict | None:
    """Upload metadata for scaling stored solar; legacy uploads default to absolute @ 60 MW."""
    if db is None:
        return None
    meta = get_date_upload_meta(db, for_date)
    if meta is not None:
        return meta
    from services.generation_store import get_generation_for_date
    rows = get_generation_for_date(db, for_date)
    if any(r.get("has_upload") for r in rows):
        return {"solar_ac_mw": DEFAULT_SOLAR_AC_MW, "mode": "absolute"}
    return None


def _apply_overrides(
    forecast_df: pd.DataFrame,
    overrides,
    solar_ac_mw: float,
    active_segments: list,
    upload_meta: dict | None = None,
) -> pd.DataFrame:
    """
    Apply per-block wind/solar overrides, then re-apply curtailment.

    Overrides update the raw (pre-curtailment) profile. Curtailment segments are
    enforced afterward so uploaded/edited values cannot bypass wind+solar curtailment.
    Solar MW from overrides is capped at solar_ac_mw (Solar Net Capacity nameplate).
    """
    if not overrides:
        return forecast_df
    df = forecast_df.copy()
    override_map = {int(o['block']): o for o in overrides}
    for idx, row in df.iterrows():
        b = int(row['block'])
        if b not in override_map:
            continue
        ov = override_map[b]
        if 'wind_mw' in ov:
            wind_val = float(ov['wind_mw'])
            df.at[idx, 'wind_mw_raw'] = wind_val
        if 'solar_mw' in ov:
            raw_solar = float(ov['solar_mw'])
            if upload_meta:
                solar_val = scale_stored_solar_mw(raw_solar, solar_ac_mw, upload_meta)
            else:
                solar_val = min(raw_solar, solar_ac_mw)
            df.at[idx, 'solar_mw_raw'] = solar_val
    return apply_curtailment_to_dataframe(df, active_segments)


def _psp_params(request) -> dict:
    """PSP limits shared across schedule / RTC / multi-day endpoints."""
    return {
        "max_soc": request.max_soc_mwh,
        "max_charge": request.max_charge_mw,
        "max_discharge": request.max_discharge_mw,
        "min_dispatch_mw": request.min_dispatch_mw,
        "roundtrip_loss_pct": request.roundtrip_loss_pct,
        "transmission_loss_pct": request.transmission_loss_pct,
        "min_compliance_ratio": request.min_compliance_ratio,
        "discharge_target": request.discharge_target,
    }


def _resolve_segments(request) -> list | None:
    """Extract the curtailment segments list from any request schema."""
    segs = getattr(request, 'curtailment_segments', None)
    if segs is None:
        return None
    return [s.model_dump() if hasattr(s, 'model_dump') else dict(s) for s in segs]


def _resolve_psp_discharge_segments(request) -> list | None:
    """Extract PSP discharge segments from any request schema."""
    segs = getattr(request, 'psp_discharge_segments', None)
    if not segs:
        return None
    return [s.model_dump() if hasattr(s, 'model_dump') else dict(s) for s in segs]


def _forecast_for_request(
    request,
    active_segments: list,
    *,
    date: str | None = None,
    block_overrides=None,
    upload_meta: dict | None = None,
):
    """Zero baseline forecast + optional block overrides (PostgreSQL-sourced generation)."""
    target_date = date or request.date
    forecast_df = generate_forecast(
        date_str=target_date,
        wtg_count=request.wtg_count,
        solar_ac_mw=request.solar_ac_mw,
        curtailment_enabled=request.curtailment_enabled,
        curtailment_segments=_resolve_segments(request),
        curtailment_start_block=request.curtailment_start_block,
        curtailment_end_block=request.curtailment_end_block,
        use_reference_data=False,
    )
    overrides = block_overrides if block_overrides is not None else getattr(request, 'block_overrides', None)
    return _apply_overrides(
        forecast_df,
        overrides,
        request.solar_ac_mw,
        active_segments,
        upload_meta=upload_meta,
    )


@router.post("/schedule", response_model=ScheduleResponse)
def get_optimal_schedule(request: ScheduleRequest, db: Session = Depends(get_db)):
    """
    Accepts turbine count, solar capacity, RTC commitment, and a date.
    Calculates the 96-block generation forecast and runs the sequential PSP optimization.

    Priority: discharge PSP toward full RTC commitment when generation is below RTC
    and SoC is available; charge surplus above RTC. 50% of RTC is the regulatory
    compliance floor (pass/fail), not the discharge target.
    """
    try:
        active_segments = resolve_active_segments(
            curtailment_enabled=request.curtailment_enabled,
            curtailment_segments=_resolve_segments(request),
            curtailment_start_block=request.curtailment_start_block,
            curtailment_end_block=request.curtailment_end_block,
        )
        forecast_df = _forecast_for_request(
            request,
            active_segments,
            upload_meta=_resolve_upload_meta(db, request.date),
        )

        dispatch_results = optimize_psp_dispatch(
            forecast_df=forecast_df,
            rtc_commitment=request.rtc_commitment_mw,
            initial_soc=request.initial_soc_mwh,
            prev_day_charge_schedule=request.prev_day_charge_schedule,
            prev_charge_lots=request.prev_charge_lots,
            global_block_offset=request.global_block_offset,
            psp_discharge_segments=_resolve_psp_discharge_segments(request),
            **_psp_params(request),
        )

        return dispatch_results
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Scheduling optimization failed: {str(e)}")


@router.post("/max-rtc", response_model=MaxRTCResponse)
def get_max_possible_rtc(request: MaxRTCRequest, db: Session = Depends(get_db)):
    """
    Calculates the maximum RTC commitment where ALL 96 blocks remain compliant
    (no shortfall at any block). Returns the schedule for that commitment.
    """
    try:
        active_segments = resolve_active_segments(
            curtailment_enabled=request.curtailment_enabled,
            curtailment_segments=_resolve_segments(request),
            curtailment_start_block=request.curtailment_start_block,
            curtailment_end_block=request.curtailment_end_block,
        )
        forecast_df = _forecast_for_request(
            request,
            active_segments,
            upload_meta=_resolve_upload_meta(db, request.date),
        )

        psp = _psp_params(request)
        psp_dis_segs = _resolve_psp_discharge_segments(request)
        max_rtc = find_max_rtc_no_shortfall(
            forecast_df=forecast_df,
            initial_soc=request.initial_soc_mwh,
            psp_discharge_segments=psp_dis_segs,
            **psp,
        )

        dispatch_results = optimize_psp_dispatch(
            forecast_df=forecast_df,
            rtc_commitment=max_rtc,
            initial_soc=request.initial_soc_mwh,
            psp_discharge_segments=psp_dis_segs,
            **psp,
        )

        return MaxRTCResponse(
            max_rtc_commitment_mw=max_rtc,
            schedule=dispatch_results,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to calculate maximum possible RTC: {str(e)}")


@router.post("/rtc-range", response_model=RTCRangeResponse)
def get_rtc_range(request: RTCRangeRequest, db: Session = Depends(get_db)):
    """
    Returns min / Manikaran's Suggestion / max committable RTC for the given plant config.

    - min_rtc_mw        : 50% of P10 non-curtailment generation (safe floor)
    - recommended_rtc_mw: Max RTC with 100% block compliance (zero shortfall) — Manikaran's Suggestion
    - max_rtc_mw        : P90 non-curtailment generation (needs PSP backup for ~10% blocks)

    Curtailment window (configurable) is excluded from the analysis.
    """
    try:
        active_segments = resolve_active_segments(
            curtailment_enabled=request.curtailment_enabled,
            curtailment_segments=_resolve_segments(request),
            curtailment_start_block=request.curtailment_start_block,
            curtailment_end_block=request.curtailment_end_block,
        )
        forecast_df = _forecast_for_request(
            request,
            active_segments,
            upload_meta=_resolve_upload_meta(db, request.date),
        )

        psp = _psp_params(request)
        result = calculate_rtc_range(
            forecast_df=forecast_df,
            initial_soc=request.initial_soc_mwh,
            psp_discharge_segments=_resolve_psp_discharge_segments(request),
            **psp,
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to calculate RTC range: {str(e)}")


@router.post("/multi-day-max-rtc", response_model=MultiDayMaxRTCResponse)
def get_multi_day_max_rtc(request: MultiDayMaxRTCRequest, db: Session = Depends(get_db)):
    """
    True cross-day optimal RTC: binary-searches for the maximum RTC commitment
    where every block on every requested day is 100% compliant, with SOC
    correctly chained day-over-day.

    Unlike the single-day /rtc-range endpoint, this is NOT influenced by the
    user's current RTC config — it independently finds the global optimum.
    """
    try:
        if not request.dates:
            raise ValueError("At least one date is required.")

        active_segments = resolve_active_segments(
            curtailment_enabled=request.curtailment_enabled,
            curtailment_segments=_resolve_segments(request),
            curtailment_start_block=request.curtailment_start_block,
            curtailment_end_block=request.curtailment_end_block,
        )

        forecast_dfs = [
            _forecast_for_request(
                request,
                active_segments,
                date=date,
                block_overrides=block_overrides_from_db(db, date, request.wtg_count),
                upload_meta=_resolve_upload_meta(db, date),
            )
            for date in request.dates
        ]

        # Determine binary search upper bound: P90 of generation across all days
        # + max possible PSP discharge contribution, so we don't cap the search
        import numpy as np
        all_gen = np.concatenate([
            (df['wind_mw'] + df['solar_mw']).values for df in forecast_dfs
        ])
        search_high = float(np.percentile(all_gen, 90)) + 50.0  # generous upper bound

        optimal_rtc = find_max_rtc_multiday(
            forecast_dfs=forecast_dfs,
            initial_soc=request.initial_soc_mwh,
            low=0.0,
            high=search_high,
            psp_discharge_segments=_resolve_psp_discharge_segments(request),
            **_psp_params(request),
        )

        return MultiDayMaxRTCResponse(
            optimal_rtc_mw=optimal_rtc,
            days_analyzed=len(request.dates),
            period_start=request.dates[0],
            period_end=request.dates[-1],
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Multi-day max RTC search failed: {str(e)}")
