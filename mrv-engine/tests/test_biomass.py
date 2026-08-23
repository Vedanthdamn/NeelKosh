import pytest

from mrv_engine.biomass import SPECIES_COEFFICIENTS, estimate_biomass_from_ndvi


def test_biomass_scales_linearly_with_area():
    small = estimate_biomass_from_ndvi(0.5, area_hectares=10, species="Rhizophora")
    large = estimate_biomass_from_ndvi(0.5, area_hectares=20, species="Rhizophora")
    assert large == pytest.approx(small * 2)


def test_higher_ndvi_gives_more_biomass():
    low = estimate_biomass_from_ndvi(0.2, area_hectares=50, species="Avicennia")
    high = estimate_biomass_from_ndvi(0.7, area_hectares=50, species="Avicennia")
    assert high > low


def test_biomass_is_capped_at_the_species_saturation_point():
    # NDVI at the physical maximum should never exceed the per-hectare cap, times area.
    result = estimate_biomass_from_ndvi(1.0, area_hectares=100, species="Rhizophora")
    cap = SPECIES_COEFFICIENTS["Rhizophora"]["max_agb_per_hectare"]
    assert result == pytest.approx(cap * 100)


def test_unknown_species_falls_back_to_mixed():
    result = estimate_biomass_from_ndvi(0.5, area_hectares=10, species="SomeUnlistedSpecies")
    expected = estimate_biomass_from_ndvi(0.5, area_hectares=10, species="Mixed")
    assert result == expected


def test_negative_ndvi_floors_to_zero_rather_than_going_negative():
    result = estimate_biomass_from_ndvi(-0.3, area_hectares=10, species="Mixed")
    assert result >= 0


@pytest.mark.parametrize("ndvi_value", [-1.5, 1.5])
def test_rejects_ndvi_outside_physical_range(ndvi_value):
    with pytest.raises(ValueError):
        estimate_biomass_from_ndvi(ndvi_value, area_hectares=10, species="Mixed")


def test_rejects_non_positive_area():
    with pytest.raises(ValueError):
        estimate_biomass_from_ndvi(0.5, area_hectares=0, species="Mixed")
