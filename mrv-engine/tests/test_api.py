import pytest
from fastapi.testclient import TestClient

from mrv_engine.api import app

client = TestClient(app)


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_species_lists_known_species():
    response = client.get("/species")
    assert response.status_code == 200
    assert "Rhizophora" in response.json()["species"]


def test_calculate_returns_full_pipeline_output():
    response = client.post(
        "/calculate",
        json={
            "project_id": "test-project-1",
            "area_hectares": 100,
            "species": "Rhizophora",
            "reporting_period": 4,
        },
    )
    assert response.status_code == 200
    body = response.json()

    assert body["simulated"] is True
    assert -1.0 <= body["ndvi"] <= 1.0
    assert len(body["ndvi_timeseries"]) == 4
    assert body["biomass_tonnes"] > 0
    assert body["tonnes_co2"] > 0
    # Conversion should match carbon.py's own math, not be recomputed differently in the API layer.
    assert body["tonnes_co2"] == pytest.approx(body["biomass_tonnes"] * 0.47 * (44 / 12), rel=1e-6)


def test_calculate_first_period_has_no_incremental():
    response = client.post(
        "/calculate",
        json={"project_id": "test-project-2", "area_hectares": 50, "species": "Mixed", "reporting_period": 1},
    )
    assert response.status_code == 200
    assert response.json()["tonnes_co2_incremental"] is None


def test_calculate_is_deterministic_across_repeated_calls():
    payload = {"project_id": "test-project-3", "area_hectares": 75, "species": "Avicennia", "reporting_period": 6}
    first = client.post("/calculate", json=payload).json()
    second = client.post("/calculate", json=payload).json()
    assert first == second


def test_calculate_history_is_stable_across_consecutive_vintages():
    # The invariant that matters for real usage: calling with reporting_period=N, then N+1 for
    # the same project, must not change the NDVI value that period N reported the first time.
    project_id = "test-project-stability"
    period_5 = client.post(
        "/calculate",
        json={"project_id": project_id, "area_hectares": 60, "species": "Sonneratia", "reporting_period": 5},
    ).json()
    period_6 = client.post(
        "/calculate",
        json={"project_id": project_id, "area_hectares": 60, "species": "Sonneratia", "reporting_period": 6},
    ).json()
    assert period_5["ndvi"] == period_6["ndvi_timeseries"][4]["ndvi"]


def test_calculate_rejects_non_positive_area():
    response = client.post(
        "/calculate",
        json={"project_id": "x", "area_hectares": -1, "species": "Mixed", "reporting_period": 1},
    )
    assert response.status_code == 422


def test_calculate_rejects_zero_reporting_period():
    response = client.post(
        "/calculate",
        json={"project_id": "x", "area_hectares": 10, "species": "Mixed", "reporting_period": 0},
    )
    assert response.status_code == 422


def test_calculate_unknown_species_falls_back_rather_than_erroring():
    response = client.post(
        "/calculate",
        json={"project_id": "x", "area_hectares": 10, "species": "NotARealSpecies", "reporting_period": 1},
    )
    assert response.status_code == 200
