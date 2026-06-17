import os
import pandas as pd
import numpy as np
from services.ingestion import load_power_curve, load_june_data

# Load once when module imports
try:
    df_pc = load_power_curve()
    power_map = dict(zip(df_pc['wind_speed'].round(1), df_pc['power_kw']))
except Exception as e:
    print(f"Error loading power curve: {e}")
    power_map = {}

def get_power_for_wind_speed(speed: float) -> float:
    """Look up turbine power in kW for a given wind speed (m/s).
    Wind speed → power curve lookup (Siemens Gamesa SG 3.15-114).
    Cut-in: 3.0 m/s, Cut-out: 18.0 m/s.
    """
    rounded = round(speed, 1)
    if rounded < 3.0 or rounded > 18.0:
        return 0.0
    return power_map.get(rounded, 0.0)


def _find_segment(block: int, segments: list) -> dict | None:
    """Return the first segment whose startBlock <= block <= endBlock, or None."""
    for seg in segments:
        if seg['startBlock'] <= block <= seg['endBlock']:
            return seg
    return None


def compute_scaled_solar_mw(base_solar: float, solar_ac_mw: float) -> float:
    """
    Scale the historical solar profile (reference 175 MW AC plant) to the configured
    Solar Net Capacity. Output is never above solar_ac_mw — that slider is the nameplate cap.
    """
    scaled = max(base_solar, 0.0) * 0.9 * (solar_ac_mw / 175.0)
    return min(scaled, solar_ac_mw)


def resolve_active_segments(
    curtailment_enabled: bool = True,
    curtailment_segments: list | None = None,
    curtailment_start_block: int = 37,
    curtailment_end_block: int = 64,
) -> list:
    """Resolve the curtailment segment list (shared by forecast and override re-application)."""
    if curtailment_segments is not None:
        return curtailment_segments
    if curtailment_enabled:
        return [{
            'startBlock': curtailment_start_block,
            'endBlock':   curtailment_end_block,
            'maxMw':      0.0,
        }]
    return []


def apply_block_curtailment(
    block: int,
    wind_mw_raw: float,
    solar_mw_raw: float,
    active_segments: list,
) -> tuple[float, float, bool, bool, float]:
    """
    Apply segment curtailment to raw wind/solar for one block.
    Returns (wind_mw, solar_mw, curtail_flag, curtail_partial_flag, curtail_max_mw).
    """
    seg = _find_segment(block, active_segments)

    if seg is None:
        return wind_mw_raw, solar_mw_raw, False, False, -1.0

    if seg['maxMw'] == 0.0:
        return 0.0, 0.0, True, False, 0.0

    combined_raw = wind_mw_raw + solar_mw_raw
    cap = float(seg['maxMw'])
    if combined_raw > cap:
        scale = cap / combined_raw
        return wind_mw_raw * scale, solar_mw_raw * scale, False, True, cap

    return wind_mw_raw, solar_mw_raw, False, True, cap


def apply_curtailment_to_dataframe(df: pd.DataFrame, active_segments: list) -> pd.DataFrame:
    """Re-apply curtailment segments using each row's wind_mw_raw / solar_mw_raw."""
    if df.empty:
        return df
    out = df.copy()
    for idx, row in out.iterrows():
        block = int(row['block'])
        wind_raw = float(row.get('wind_mw_raw', row['wind_mw']))
        solar_raw = float(row.get('solar_mw_raw', row['solar_mw']))
        w, s, cf, cpf, cmw = apply_block_curtailment(block, wind_raw, solar_raw, active_segments)
        out.at[idx, 'wind_mw'] = round(w, 4)
        out.at[idx, 'solar_mw'] = round(s, 4)
        out.at[idx, 'curtail_flag'] = cf
        out.at[idx, 'curtail_partial_flag'] = cpf
        out.at[idx, 'curtail_max_mw'] = cmw
    return out


def generate_forecast(
    date_str: str,
    wtg_count: int,
    solar_ac_mw: float,
    curtailment_enabled: bool = True,
    curtailment_segments: list | None = None,
    curtailment_start_block: int = 37,
    curtailment_end_block: int = 64,
) -> pd.DataFrame:
    """
    Generates a 96-block generation forecast for a given date in June.

    Wind generation uses a real power curve lookup:
      projected_speed = 0.8 * speed_2025 + 0.2 * speed_2024
      wind_mw = PowerCurve(projected_speed) / 1000 * wtg_count

    Solar generation:
      solar_mw = max(solar_2024, solar_2025, 0) * 0.9 * (solar_ac_mw / 175)

    Curtailment — segment-based:
      Each segment has startBlock, endBlock, and maxMw.
        maxMw == 0  -> full curtailment: wind=0, solar=0
        maxMw  > 0  -> combined cap: scale wind+solar proportionally so their sum <= maxMw
      Blocks not in any segment pass through uncurtailed.

    Backward compatibility:
      If curtailment_segments is None and curtailment_enabled is True, a single full-curtailment
      segment is auto-built from curtailment_start_block / curtailment_end_block.
      If curtailment_enabled is False and curtailment_segments is None, no curtailment is applied.
    """
    active_segments = resolve_active_segments(
        curtailment_enabled=curtailment_enabled,
        curtailment_segments=curtailment_segments,
        curtailment_start_block=curtailment_start_block,
        curtailment_end_block=curtailment_end_block,
    )

    june_df = load_june_data()

    try:
        requested_day = pd.to_datetime(date_str).day
    except Exception:
        requested_day = 1

    historical_date_str = f"2024-06-{requested_day:02d}"
    day_data = june_df[june_df['date'] == historical_date_str].copy()

    if len(day_data) == 0:
        # Fallback: match by day-of-month if date column format differs
        june_dates = pd.to_datetime(june_df['date'], errors='coerce')
        day_data = june_df[june_dates.dt.day == requested_day].copy()

    if len(day_data) == 0:
        # No historical reference — build a flat zero-baseline so any date works.
        # Uploaded block_overrides will replace these zeros with real forecast values.
        time_labels = [
            f"{h:02d}:{m:02d}:00"
            for h in range(24)
            for m in (0, 15, 30, 45)
        ]
        day_data = pd.DataFrame({
            "block":          list(range(1, 97)),
            "time":           time_labels,
            "wind_speed_2024": [0.0] * 96,
            "wind_speed_2025": [0.0] * 96,
            "solar_2024":      [0.0] * 96,
            "solar_2025":      [0.0] * 96,
        })

    results = []
    for _, row in day_data.iterrows():
        block = int(row['block'])
        time_str = str(row['time'])

        # Wind: 2026 projection via weighted blend
        speed_2024 = float(row['wind_speed_2024'])
        speed_2025 = float(row['wind_speed_2025'])
        projected_speed = 0.8 * speed_2025 + 0.2 * speed_2024

        # Power curve lookup -> total farm output
        power_per_wtg_kw = get_power_for_wind_speed(projected_speed)
        wind_mw_raw = (power_per_wtg_kw / 1000.0) * wtg_count

        # Solar
        solar_2024 = float(row['solar_2024'])
        solar_2025 = float(row['solar_2025'])
        base_solar = max(solar_2024, solar_2025, 0.0)
        solar_mw_raw = compute_scaled_solar_mw(base_solar, solar_ac_mw)

        wind_mw_post, solar_mw_post, curtail_flag, curtail_partial_flag, curtail_max_mw = (
            apply_block_curtailment(block, wind_mw_raw, solar_mw_raw, active_segments)
        )

        results.append({
            "block":                block,
            "time":                 time_str,
            "wind_speed":           round(projected_speed, 2),
            "wind_speed_2024":      round(speed_2024, 2),
            "wind_speed_2025":      round(speed_2025, 2),
            "wind_mw_raw":          round(wind_mw_raw,  4),   # pre-curtailment
            "wind_mw":              round(wind_mw_post, 4),   # post-curtailment
            "solar_mw_raw":         round(solar_mw_raw,  4),
            "solar_mw":             round(solar_mw_post, 4),
            "curtail_flag":         curtail_flag,           # True only for maxMw=0 segments
            "curtail_partial_flag": curtail_partial_flag,   # True for maxMw>0 segments
            "curtail_max_mw":       curtail_max_mw,         # -1=no seg, 0=full, >0=cap
        })

    return pd.DataFrame(results)
