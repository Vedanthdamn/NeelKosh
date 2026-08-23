from datetime import date

import pytest

from mrv_engine.ndvi import generate_ndvi_timeseries


def test_returns_requested_number_of_periods():
    result = generate_ndvi_timeseries("project-a", date(2022, 1, 1), num_periods=8)
    assert len(result) == 8
    assert [r["period_index"] for r in result] == list(range(8))


def test_values_stay_within_physical_ndvi_bounds():
    result = generate_ndvi_timeseries("project-b", date(2022, 1, 1), num_periods=40)
    for reading in result:
        assert -1.0 <= reading["ndvi"] <= 1.0


def test_starts_low_and_grows_toward_a_plateau():
    # Slow-start / fast-middle / plateau: the first reading should be well below the last, and
    # the last few readings should be close to each other (plateaued), not still climbing hard.
    result = generate_ndvi_timeseries("project-c", date(2022, 1, 1), num_periods=20)
    first, last = result[0]["ndvi"], result[-1]["ndvi"]
    assert first < 0.3, "expected a low, bare-mudflat-like starting NDVI"
    assert last > first, "expected NDVI to have grown by the end of the series"

    tail = [r["ndvi"] for r in result[-4:]]
    assert max(tail) - min(tail) < 0.15, "expected the tail of the series to have plateaued"


def test_deterministic_for_the_same_project_id():
    a = generate_ndvi_timeseries("same-project", date(2022, 1, 1), num_periods=10)
    b = generate_ndvi_timeseries("same-project", date(2022, 1, 1), num_periods=10)
    assert a == b


def test_different_projects_get_different_curves():
    a = generate_ndvi_timeseries("project-x", date(2022, 1, 1), num_periods=10)
    b = generate_ndvi_timeseries("project-y", date(2022, 1, 1), num_periods=10)
    assert a != b


def test_dates_advance_by_period_days():
    result = generate_ndvi_timeseries("project-d", date(2022, 1, 1), num_periods=3, period_days=30)
    dates = [r["date"] for r in result]
    assert dates == ["2022-01-01", "2022-01-31", "2022-03-02"]


@pytest.mark.parametrize("num_periods", [0, -1])
def test_rejects_non_positive_num_periods(num_periods):
    with pytest.raises(ValueError):
        generate_ndvi_timeseries("project-e", date(2022, 1, 1), num_periods=num_periods)
