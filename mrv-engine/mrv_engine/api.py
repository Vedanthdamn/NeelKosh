"""
FastAPI wrapper exposing the synthetic MRV pipeline as an HTTP service the Node backend calls
instead of importing this package directly (keeping the two services in separate runtimes and
languages, talking over a plain HTTP contract).

Every response is explicitly labeled `"simulated": true` — see ndvi.py's module docstring for
why, and what would change to replace the generator with real Sentinel-2 imagery.
"""

from __future__ import annotations

from datetime import date

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from .biomass import SPECIES_COEFFICIENTS, estimate_biomass_from_ndvi
from .carbon import CARBON_FRACTION_OF_BIOMASS, estimate_carbon_sequestered
from .ndvi import DEFAULT_PERIOD_DAYS, generate_ndvi_timeseries

app = FastAPI(
    title="NeelKosh MRV Engine",
    description="Synthetic satellite-based carbon quantification for the NeelKosh demo. "
    "All NDVI data is fabricated — see ndvi.py for why and what a real pipeline would do instead.",
    version="0.1.0",
)

# Restoration project start used when a caller doesn't supply one. Real projects have a real
# registration date on chain (ProjectRegistry.registeredAt); this is only a fallback so the
# minimum required request fields still produce a sensible curve.
DEFAULT_PROJECT_START_DATE = date(2022, 1, 1)


class NDVIReading(BaseModel):
    period_index: int
    date: str
    ndvi: float


class CalculateRequest(BaseModel):
    project_id: str
    area_hectares: float = Field(gt=0)
    species: str = Field(description=f"One of {sorted(SPECIES_COEFFICIENTS)}; unrecognized values fall back to 'Mixed'.")
    reporting_period: int = Field(
        ge=1, description="1-based period index along this project's synthetic growth curve, e.g. 4 = 4 quarters in."
    )
    start_date: date | None = Field(
        default=None, description="Restoration start date. Defaults to a fixed demo date if omitted."
    )
    period_days: int = Field(default=DEFAULT_PERIOD_DAYS, gt=0, description="Spacing between synthetic readings.")


class CalculateResponse(BaseModel):
    project_id: str
    reporting_period: int
    area_hectares: float
    species: str
    simulated: bool = True

    ndvi: float
    ndvi_timeseries: list[NDVIReading]

    agb_per_hectare: float
    biomass_tonnes: float
    carbon_tonnes: float
    tonnes_co2: float
    tonnes_co2_incremental: float | None

    note: str


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/species")
def list_species() -> dict:
    """Species this engine has biomass regression coefficients for, for building a form dropdown."""
    return {"species": sorted(SPECIES_COEFFICIENTS)}


@app.post("/calculate", response_model=CalculateResponse)
def calculate(request: CalculateRequest) -> CalculateResponse:
    """
    Runs the full synthetic pipeline for one project at one reporting period: NDVI -> biomass ->
    CO2e, returning every intermediate value so a caller can show its work ("how we got this
    number") rather than just a final figure.

    tonnes_co2 is the CO2-equivalent of the *total standing biomass carbon stock* estimated for
    this reporting period — i.e. everything the project has sequestered cumulatively up to this
    point, not just what it sequestered during this period alone. tonnes_co2_incremental is that
    stock minus the previous period's stock: the actual new sequestration this period, which is
    the figure a credit-issuance pipeline should mint against. Minting the stock value for every
    vintage would credit the same standing trees again each year. tonnes_co2_incremental is null
    for reporting_period 1, since there's no previous period to subtract.
    """
    start_date = request.start_date or DEFAULT_PROJECT_START_DATE

    try:
        timeseries = generate_ndvi_timeseries(
            project_id=request.project_id,
            start_date=start_date,
            num_periods=request.reporting_period,
            period_days=request.period_days,
        )
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error

    current_ndvi = timeseries[-1]["ndvi"]

    try:
        agb_per_hectare = estimate_biomass_from_ndvi(current_ndvi, area_hectares=1.0, species=request.species)
        biomass_tonnes = estimate_biomass_from_ndvi(current_ndvi, area_hectares=request.area_hectares, species=request.species)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error

    carbon_tonnes = biomass_tonnes * CARBON_FRACTION_OF_BIOMASS
    tonnes_co2 = estimate_carbon_sequestered(biomass_tonnes)

    tonnes_co2_incremental: float | None = None
    if len(timeseries) >= 2:
        previous_ndvi = timeseries[-2]["ndvi"]
        previous_biomass = estimate_biomass_from_ndvi(previous_ndvi, area_hectares=request.area_hectares, species=request.species)
        previous_tonnes_co2 = estimate_carbon_sequestered(previous_biomass)
        # Deliberately not floored at zero: a real period can show no net growth or a decline
        # (drought, storm damage, measurement noise), and silently clamping that to zero would
        # hide a real signal rather than report it.
        tonnes_co2_incremental = tonnes_co2 - previous_tonnes_co2

    return CalculateResponse(
        project_id=request.project_id,
        reporting_period=request.reporting_period,
        area_hectares=request.area_hectares,
        species=request.species,
        ndvi=current_ndvi,
        ndvi_timeseries=[NDVIReading(**reading) for reading in timeseries],
        agb_per_hectare=agb_per_hectare,
        biomass_tonnes=biomass_tonnes,
        carbon_tonnes=carbon_tonnes,
        tonnes_co2=tonnes_co2,
        tonnes_co2_incremental=tonnes_co2_incremental,
        note=(
            "SIMULATED DATA: no real satellite imagery was used. tonnes_co2 is a cumulative "
            "standing-stock estimate; tonnes_co2_incremental is the period-over-period change, "
            "which is what a credit-issuance pipeline should actually mint against."
        ),
    )
