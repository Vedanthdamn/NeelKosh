import pytest

from mrv_engine.carbon import estimate_carbon_sequestered


def test_matches_hand_calculated_conversion():
    # 100 t biomass * 0.47 carbon fraction = 47 t carbon; 47 * (44/12) = 172.333... t CO2e.
    result = estimate_carbon_sequestered(100.0)
    assert result == pytest.approx(100.0 * 0.47 * (44 / 12), rel=1e-9)


def test_zero_biomass_gives_zero_co2():
    assert estimate_carbon_sequestered(0.0) == 0.0


def test_co2_is_greater_than_biomass_mass():
    # Sanity check on the direction of the ratio: converting carbon to CO2 mass must increase
    # it, not decrease it, since CO2 is heavier than the carbon atom alone.
    biomass = 500.0
    assert estimate_carbon_sequestered(biomass) > biomass * 0.47


def test_rejects_negative_biomass():
    with pytest.raises(ValueError):
        estimate_carbon_sequestered(-1.0)
