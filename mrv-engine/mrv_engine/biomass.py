"""
NDVI-to-biomass estimation.

Remote-sensing studies of mangrove and tropical forest biomass commonly regress a vegetation
index like NDVI against field-measured above-ground biomass (AGB) — biomass measured on the
ground, either destructively (cut, dry, weigh a sample plot) or via allometric equations from
tree diameter and height — because AGB itself can't be seen directly from a satellite image; only
canopy reflectance can. Because NDVI saturates in dense canopies (see the note in ndvi.py), the
fitted relationship is typically nonlinear — an exponential or power-law form that rises quickly
at low-to-moderate NDVI and flattens out at high NDVI, rather than a straight line — and the
fitted coefficients are specific to the species, region, and sensor used in that particular
study; they are not universal constants.

The coefficients below follow that same general shape (exponential, saturating) but are
illustrative values for this demo, tuned only to sit within the broad order of magnitude that
published tropical mangrove AGB studies report (roughly tens of Mg/ha for young/sparse stands up
to a few hundred Mg/ha for mature, dense stands, depending heavily on species and site). A real
deployment would calibrate these coefficients against field plots measured for NeelKosh's actual
project sites and species — that calibration, not the choice of curve shape, is the part real MRV
projects spend their effort on.
"""

from __future__ import annotations

import math

# a, b: exponential regression coefficients, AGB (Mg/ha, i.e. tonnes/hectare) = a * exp(b * NDVI).
# max_agb_per_hectare: saturation cap — dense, mature canopies stop producing much additional
# NDVI signal well before biomass stops accumulating, so an uncapped exponential would overstate
# biomass at high NDVI. Capping represents that real, well-documented saturation effect.
SPECIES_COEFFICIENTS: dict[str, dict[str, float]] = {
    "Rhizophora": {"a": 8.0, "b": 4.3, "max_agb_per_hectare": 350.0},
    "Avicennia": {"a": 6.0, "b": 4.0, "max_agb_per_hectare": 220.0},
    "Sonneratia": {"a": 7.0, "b": 4.1, "max_agb_per_hectare": 260.0},
    # Fallback for a restoration site planted with a mix of species, or a species not listed above.
    "Mixed": {"a": 7.0, "b": 4.1, "max_agb_per_hectare": 280.0},
}


def estimate_biomass_from_ndvi(ndvi_value: float, area_hectares: float, species: str) -> float:
    """
    Estimates total above-ground biomass (AGB) for a project area from a single NDVI reading,
    using a simplified per-species exponential NDVI-to-AGB regression (see module docstring).

    Args:
        ndvi_value: NDVI reading, must be in [-1, 1].
        area_hectares: Project area in hectares, must be positive.
        species: One of SPECIES_COEFFICIENTS' keys; unrecognized values fall back to "Mixed"
            rather than raising, since a caller shouldn't have to know the exact species list to
            get a plausible (if generic) estimate.

    Returns:
        Estimated above-ground biomass in tonnes for the whole area.
    """
    if not -1.0 <= ndvi_value <= 1.0:
        raise ValueError(f"ndvi_value must be in [-1, 1], got {ndvi_value}")
    if area_hectares <= 0:
        raise ValueError(f"area_hectares must be positive, got {area_hectares}")

    coefficients = SPECIES_COEFFICIENTS.get(species, SPECIES_COEFFICIENTS["Mixed"])

    # NDVI can be slightly negative (open water, cloud shadow) even over a project area if a
    # pixel composite includes tidal channels; exp() handles negative input fine, but biomass
    # from a negative reading isn't physically meaningful, so floor the input to the regression.
    effective_ndvi = max(ndvi_value, 0.0)

    agb_per_hectare = coefficients["a"] * math.exp(coefficients["b"] * effective_ndvi)
    agb_per_hectare = min(agb_per_hectare, coefficients["max_agb_per_hectare"])

    return agb_per_hectare * area_hectares
