"""Solar capacity scaling for uploaded generation data."""

from services.forecast import compute_scaled_solar_mw
from services.generation_store import scale_stored_solar_mw


def test_absolute_mode_scales_with_capacity_ratio():
    meta = {"solar_ac_mw": 50.0, "mode": "absolute"}
    assert scale_stored_solar_mw(25.0, 100.0, meta) == 50.0
    assert scale_stored_solar_mw(25.0, 50.0, meta) == 25.0
    assert scale_stored_solar_mw(60.0, 100.0, meta) == 100.0  # capped at nameplate


def test_reference_mode_uses_forecast_scaling():
    meta = {"solar_ac_mw": 50.0, "mode": "reference"}
    base = 100.0
    expected = compute_scaled_solar_mw(base, 100.0)
    assert scale_stored_solar_mw(base, 100.0, meta) == expected


def test_legacy_upload_defaults_to_absolute_at_60mw():
    # No meta: assume data was uploaded at 60 MW AC
    assert scale_stored_solar_mw(30.0, 100.0, None) == 50.0
