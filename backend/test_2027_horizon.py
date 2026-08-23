"""Unit tests for 2027 horizon date normalization and contract validation."""

from services.constants import CONTRACT_END_DATE, CONTRACT_START_DATE
from services.generation_store import (
    iter_contract_dates,
    normalize_upload_date,
    validate_contract_date,
)
from fastapi import HTTPException


def test_contract_constants():
    assert CONTRACT_START_DATE == "2026-06-01"
    assert CONTRACT_END_DATE == "2027-05-31"


def test_normalize_upload_date_2027():
    # Explicit ISO 2027 (including April and May)
    assert normalize_upload_date("2027-01-15") == "2027-01-15"
    assert normalize_upload_date("2027-03-31") == "2027-03-31"
    assert normalize_upload_date("2027-04-15") == "2027-04-15"
    assert normalize_upload_date("2027-05-31") == "2027-05-31"

    # DD/MM/YY format for 2027
    assert normalize_upload_date("15/01/27") == "2027-01-15"
    assert normalize_upload_date("31-03-27") == "2027-03-31"
    assert normalize_upload_date("15/04/27") == "2027-04-15"
    assert normalize_upload_date("31/05/27") == "2027-05-31"

    # 2026 dates
    assert normalize_upload_date("2026-06-01") == "2026-06-01"
    assert normalize_upload_date("01/06/26") == "2026-06-01"

    # Historical mapping (years < 2026 or pre-June 2026)
    # June 2024 -> June 2026
    assert normalize_upload_date("2024-06-15") == "2026-06-15"
    # Jan 2024 -> Jan 2027
    assert normalize_upload_date("2024-01-15") == "2027-01-15"
    # April 2024 -> April 2027
    assert normalize_upload_date("2024-04-15") == "2027-04-15"
    # May 2024 -> May 2027
    assert normalize_upload_date("2024-05-20") == "2027-05-20"


def test_validate_contract_date():
    assert validate_contract_date("2026-06-01") == "2026-06-01"
    assert validate_contract_date("2027-01-15") == "2027-01-15"
    assert validate_contract_date("2027-03-31") == "2027-03-31"
    assert validate_contract_date("2027-04-15") == "2027-04-15"
    assert validate_contract_date("2027-05-31") == "2027-05-31"

    # Test out of bounds (after May 2027)
    try:
        validate_contract_date("2027-06-01")
        assert False, "Should have raised HTTPException for post-contract date"
    except HTTPException as e:
        assert e.status_code == 400


def test_iter_contract_dates():
    dates = iter_contract_dates("2026-12-30", "2027-01-02")
    assert dates == ["2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02"]

    may_dates = iter_contract_dates("2027-04-29", "2027-05-02")
    assert may_dates == ["2027-04-29", "2027-04-30", "2027-05-01", "2027-05-02"]


from services.generation_store import parse_generation_csv

def test_parse_generation_csv_2027():
    sample_csv = (
        "date,block,wind_speed,solar_mw\n"
        "2027-04-15,1,8.5,45.2\n"
        "2027-05-15,2,9.0,50.0\n"
        "2027-05-31,96,7.2,12.5\n"
    )
    rows = parse_generation_csv(sample_csv)
    assert len(rows) == 3
    assert rows[0]["date"] == "2027-04-15"
    assert rows[0]["block"] == 1
    assert rows[1]["date"] == "2027-05-15"
    assert rows[2]["date"] == "2027-05-31"
    assert rows[2]["block"] == 96


if __name__ == "__main__":
    test_contract_constants()
    test_normalize_upload_date_2027()
    test_validate_contract_date()
    test_iter_contract_dates()
    test_parse_generation_csv_2027()
    print("All 2027 horizon date unit tests passed successfully!")
