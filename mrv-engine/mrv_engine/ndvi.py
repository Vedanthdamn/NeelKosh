"""
NDVI time series generation.

============================================================================
THIS MODULE SIMULATES SATELLITE DATA. IT DOES NOT CALL ANY SATELLITE, EVER.
============================================================================

NeelKosh's real MRV pipeline is meant to derive vegetation health from Sentinel-2 imagery. We
don't have Google Earth Engine access wired up for this demo, so this module generates a
synthetic-but-plausible NDVI growth curve instead, seeded deterministically from the project id
so the same project always produces the same "satellite record" across repeated calls. Every
value this module returns is fabricated. Nothing here should ever be presented to a user, a
judge, or (obviously) a real verifier as an actual satellite reading — see api.py's response
fields, which are labeled accordingly.

What NDVI is, briefly: the Normalized Difference Vegetation Index is computed per pixel from a
satellite image as (NIR - Red) / (NIR + Red), where NIR and Red are reflectance in the
near-infrared and red bands. Healthy vegetation reflects strongly in NIR and absorbs Red for
photosynthesis, pushing NDVI toward +1; bare soil and mudflats sit low-positive (~0.1-0.3); open
water and cloud tend negative. It ranges from -1 to 1 by construction of the formula.

Why a logistic curve, not a straight line: mangrove restoration doesn't green up linearly.
Newly planted seedlings or bare mudflat start with sparse cover (low NDVI). Growth is slow at
first (root establishment, tidal stress, seedling mortality), accelerates through a middle phase
as canopy closes, then plateaus as the stand approaches canopy closure and NDVI saturates —
dense canopies stop producing much additional NDVI signal even as biomass keeps accumulating
underneath (this saturation is also why the biomass regression in biomass.py caps out at high
NDVI rather than growing without bound). A logistic (sigmoid) curve is the standard shape for
exactly this slow-fast-slow growth pattern.

--------------------------------------------------------------------------------
What would change to use real Sentinel-2 data via Google Earth Engine instead
--------------------------------------------------------------------------------
This function would be replaced (its signature could stay the same, so callers in biomass.py
and api.py wouldn't need to change) with something like:

    import ee
    ee.Initialize()

    def generate_ndvi_timeseries(project_id, start_date, num_periods, period_days=90):
        boundary = load_project_boundary(project_id)          # from ProjectRegistry, via the backend
        geometry = ee.Geometry.Polygon(boundary_to_coords(boundary))
        readings = []
        for period_index in range(num_periods):
            period_start = start_date + timedelta(days=period_index * period_days)
            period_end = period_start + timedelta(days=period_days)
            collection = (
                ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
                .filterBounds(geometry)
                .filterDate(str(period_start), str(period_end))
                .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 20))
            )
            composite = collection.median()  # cloud-free-ish composite over the period
            ndvi_image = composite.normalizedDifference(["B8", "B4"])  # NIR, Red
            mean_ndvi = ndvi_image.reduceRegion(
                reducer=ee.Reducer.mean(), geometry=geometry, scale=10
            ).get("nd").getInfo()
            readings.append({"period_index": period_index, "date": period_start, "ndvi": mean_ndvi})
        return readings

The differences that matter: real imagery needs cloud masking (a naive median composite over a
monsoon-season window can still be cloud-contaminated; production pipelines use QA60 bands or a
dedicated cloud probability product like s2cloudless), the polygon has to come from the actual
registered boundary rather than being assumed, and a period can come back with no usable
composite at all (persistent cloud cover) — which this synthetic generator never has to handle
because it never fails.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from datetime import date, timedelta

import numpy as np

# Physical bound on NDVI by construction of the formula.
NDVI_MIN_BOUND = -1.0
NDVI_MAX_BOUND = 1.0

# Default spacing between readings. Quarterly mirrors how MRV reporting periods and cloud-free
# composites are typically assembled in practice — monthly is often too cloud-gappy in tropical
# coastal regions to reliably get a clean composite every period.
DEFAULT_PERIOD_DAYS = 90


@dataclass(frozen=True)
class NDVIReading:
    period_index: int
    date: date
    ndvi: float

    def as_dict(self) -> dict:
        return {"period_index": self.period_index, "date": self.date.isoformat(), "ndvi": self.ndvi}


def _seed_from_project_id(project_id: str) -> int:
    """Deterministic seed so the same project always yields the same synthetic curve."""
    digest = hashlib.sha256(project_id.encode("utf-8")).digest()
    return int.from_bytes(digest[:4], "big")


def generate_ndvi_timeseries(
    project_id: str,
    start_date: date,
    num_periods: int,
    period_days: int = DEFAULT_PERIOD_DAYS,
) -> list[dict]:
    """
    Generates a synthetic NDVI time series for a restoration project: a logistic growth curve
    from a sparse/bare-mudflat baseline toward a healthy-canopy plateau, with realistic noise.

    Deterministic per project_id — the same project_id always produces the same curve, so
    repeated calls (e.g. re-rendering a dashboard) don't return a different "satellite history"
    each time. Different projects get different curves.

    Args:
        project_id: Identifies the project; seeds the deterministic random state.
        start_date: Date of the first reading (typically restoration start / planting date).
        num_periods: Number of readings to generate, spaced period_days apart.
        period_days: Days between readings. Defaults to a quarterly cadence.

    Returns:
        A list of {period_index, date (ISO string), ndvi} dicts, oldest first.
    """
    if num_periods < 1:
        raise ValueError("num_periods must be at least 1")
    if period_days < 1:
        raise ValueError("period_days must be at least 1")

    rng = np.random.default_rng(_seed_from_project_id(project_id))

    # Curve parameters vary a little per project (a restoration site isn't a fixed template),
    # but stay within realistic bounds for mangrove restoration. Critically, none of these depend
    # on num_periods: the curve is a fixed function of period_index and project_id alone, so
    # asking for more periods later (as real reporting periods accumulate, one vintage at a time)
    # never reshapes NDVI values already returned for earlier periods. A caller compares vintage
    # N to vintage N-1 by calling this twice with num_periods=N-1 and num_periods=N; that only
    # works if period_index=3 means the same thing both times.
    ndvi_start = rng.uniform(0.08, 0.20)  # bare mudflat / freshly planted seedlings
    ndvi_plateau = rng.uniform(0.70, 0.85)  # healthy closed-canopy mangrove
    # midpoint: period index at which the curve is halfway to plateau. steepness: how sharply it
    # transitions. Both are in fixed units of "periods" (quarters, by default), calibrated to a
    # restoration timescale of roughly 2-4 years to near-plateau — independent of how many
    # periods any single request happens to ask for.
    midpoint = rng.uniform(6, 12)
    steepness = rng.uniform(0.35, 0.55)

    noise_std = 0.02  # small per-reading measurement/seasonal jitter

    readings: list[NDVIReading] = []
    for period_index in range(num_periods):
        logistic = ndvi_start + (ndvi_plateau - ndvi_start) / (
            1 + np.exp(-steepness * (period_index - midpoint))
        )
        noisy = logistic + rng.normal(0, noise_std)
        clipped = float(np.clip(noisy, NDVI_MIN_BOUND, NDVI_MAX_BOUND))

        reading_date = start_date + timedelta(days=period_index * period_days)
        readings.append(NDVIReading(period_index=period_index, date=reading_date, ndvi=round(clipped, 4)))

    return [reading.as_dict() for reading in readings]
