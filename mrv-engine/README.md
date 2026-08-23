# NeelKosh MRV Engine

Simulates the satellite-based carbon quantification step of NeelKosh's MRV pipeline. We don't
have live Sentinel-2 / Google Earth Engine access for this demo, so this generates synthetic but
scientifically grounded data instead — see the top of `mrv_engine/ndvi.py` for exactly what's
fabricated, why, and what would change to plug in real satellite data.

## Pipeline

```
generate_ndvi_timeseries()  ->  estimate_biomass_from_ndvi()  ->  estimate_carbon_sequestered()
   (mrv_engine/ndvi.py)          (mrv_engine/biomass.py)            (mrv_engine/carbon.py)
   logistic growth curve         per-species exponential            IPCC carbon fraction (0.47),
   seeded per project_id         NDVI-to-biomass regression          then 44/12 CO2:C ratio
```

Every step is a plain, dependency-light Python function — `api.py` is a thin FastAPI wrapper
around them, not where any of the actual logic lives.

## Running it

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
pip install -e .
```

Sample runs (prints a few projects' growth curves to eyeball):

```bash
python scripts/sample_runs.py
```

Tests:

```bash
pytest -v
```

API server:

```bash
uvicorn mrv_engine.api:app --reload --port 8000
```

Interactive docs at `http://localhost:8000/docs`. Example call:

```bash
curl -X POST http://localhost:8000/calculate \
  -H "Content-Type: application/json" \
  -d '{"project_id": "sundarbans-wb-1", "area_hectares": 240, "species": "Rhizophora", "reporting_period": 8}'
```

## A correctness detail worth knowing before wiring this into credit issuance

`tonnes_co2` in the `/calculate` response is the CO2-equivalent of the *total standing biomass
carbon stock* at that reporting period — everything the project has sequestered cumulatively, not
just what it gained during that one period. Minting credits against that raw stock value for
every consecutive vintage would credit the same standing trees again each year. `/calculate` also
returns `tonnes_co2_incremental` — that stock minus the previous period's stock — which is the
figure a credit-issuance pipeline should actually mint against. It's `null` for `reporting_period:
1`, since there's no previous period to subtract, and it can legitimately be negative (a bad
season, storm damage, measurement noise) — the API doesn't floor it at zero, since silently
clamping a real decline to zero would be hiding a signal, not reporting one.

## Prototype scope

Every NDVI value is fabricated by a seeded random-number generator — deterministic per
`project_id` so repeated calls return a stable "history," but never derived from an actual
satellite image. `species` accepts any string; unrecognized values fall back to a generic
"Mixed" coefficient set rather than erroring, so a caller doesn't need the exact species list to
get a plausible estimate.

The biomass regression coefficients are illustrative, tuned only to sit within the broad order of
magnitude published tropical mangrove biomass studies report. A real deployment calibrates these
against field plots (destructive sampling or allometric equations) for the actual species and
region — see `mrv_engine/biomass.py`'s module docstring.

Carbon accounting here covers above-ground biomass only, since NDVI is a canopy-reflectance
measurement and can't see roots or soil. Below-ground biomass and soil organic carbon — often the
larger carbon pool in mangroves specifically — are out of scope; see `mrv_engine/carbon.py`.
