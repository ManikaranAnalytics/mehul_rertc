"""Regression tests: PSP discharges toward full RTC commitment when SoC is available."""

import pandas as pd

from services.psp_optimizer import optimize_psp_dispatch


def _flat_forecast(gen_mw: float, blocks: int = 96) -> pd.DataFrame:
    rows = []
    for b in range(1, blocks + 1):
        total_min = (b - 1) * 15
        rows.append({
            "block": b,
            "time": f"{total_min // 60:02d}:{total_min % 60:02d}",
            "wind_mw": gen_mw,
            "solar_mw": 0.0,
            "curtail_flag": False,
        })
    return pd.DataFrame(rows)


def _single_block_forecast(gen_mw: float, block: int = 1) -> pd.DataFrame:
    total_min = (block - 1) * 15
    return pd.DataFrame([{
        "block": block,
        "time": f"{total_min // 60:02d}:{total_min % 60:02d}",
        "wind_mw": gen_mw,
        "solar_mw": 0.0,
        "curtail_flag": False,
    }])


def test_discharge_when_gen_between_floor_and_rtc():
    """Gen=30, RTC=50, SoC=100 → discharge 20 MW to meet RTC (rtc_commitment mode)."""
    res = optimize_psp_dispatch(
        _flat_forecast(30.0),
        rtc_commitment=50.0,
        initial_soc=100.0,
        min_dispatch_mw=0.0,
        discharge_target="rtc_commitment",
    )
    b = res["blocks"][0]
    assert b["psp_discharge"] == 20.0, f"expected 20 MW discharge, got {b['psp_discharge']}"
    assert b["net_schedule"] == 50.0, f"expected net 50 MW, got {b['net_schedule']}"
    assert res["summary"]["rtc_met_blocks"] >= 1


def test_no_discharge_between_floor_and_rtc_in_compliance_mode():
    """Gen=30, RTC=50 → compliance_floor mode does not discharge (30 >= 25 floor)."""
    res = optimize_psp_dispatch(
        _flat_forecast(30.0),
        rtc_commitment=50.0,
        initial_soc=100.0,
        min_dispatch_mw=0.0,
        discharge_target="compliance_floor",
    )
    b = res["blocks"][0]
    assert b["psp_discharge"] == 0.0
    assert b["net_schedule"] == 30.0
    assert res["summary"]["discharge_target"] == "compliance_floor"


def test_discharge_capped_by_soc():
    """Gen=20, RTC=50, SoC=10 MWh → discharge 30 MW (RTC gap), net=50."""
    res = optimize_psp_dispatch(
        _single_block_forecast(20.0),
        rtc_commitment=50.0,
        initial_soc=10.0,
        min_dispatch_mw=0.0,
    )
    b = res["blocks"][0]
    assert b["psp_discharge"] == 30.0
    assert b["net_schedule"] == 50.0
    assert res["summary"]["end_soc_mwh"] == 2.5


def test_no_discharge_without_soc():
    """Gen=10, RTC=50, SoC=0 → no discharge, compliance shortfall."""
    res = optimize_psp_dispatch(
        _single_block_forecast(10.0),
        rtc_commitment=50.0,
        initial_soc=0.0,
        min_dispatch_mw=0.0,
    )
    b = res["blocks"][0]
    assert b["psp_discharge"] == 0.0
    assert b["net_schedule"] == 10.0
    assert not b["compliant"]


def test_charge_surplus_when_gen_above_rtc():
    """Gen=55, RTC=50 → charge 5 MW surplus, no discharge."""
    res = optimize_psp_dispatch(
        _single_block_forecast(55.0),
        rtc_commitment=50.0,
        initial_soc=50.0,
        min_dispatch_mw=0.0,
    )
    b = res["blocks"][0]
    assert b["psp_discharge"] == 0.0
    assert b["psp_charge"] == 5.0
    assert b["net_schedule"] == 50.0


def test_discharge_all_soc_when_insufficient_for_rtc():
    """Gen=10, RTC=50, SoC=5 MWh → discharge all 20 MW, net=30 (RTC gap remains)."""
    res = optimize_psp_dispatch(
        _single_block_forecast(10.0),
        rtc_commitment=50.0,
        initial_soc=5.0,
        min_dispatch_mw=0.0,
    )
    b = res["blocks"][0]
    assert b["psp_discharge"] == 20.0
    assert b["net_schedule"] == 30.0
    assert b["compliant"]  # 30 MW still meets 50% floor (25 MW)
    assert b["net_schedule"] < 50.0


if __name__ == "__main__":
    test_discharge_when_gen_between_floor_and_rtc()
    test_no_discharge_between_floor_and_rtc_in_compliance_mode()
    test_discharge_capped_by_soc()
    test_no_discharge_without_soc()
    test_charge_surplus_when_gen_above_rtc()
    test_discharge_all_soc_when_insufficient_for_rtc()
    print("All RTC priority tests passed.")
