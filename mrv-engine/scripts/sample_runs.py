"""
Prints a few sample runs of the generator pipeline so its output can be eyeballed for
plausibility: does the NDVI curve actually look like slow-start / fast-middle / plateau growth,
and do biomass/CO2e numbers land in a sane order of magnitude.

Run with: python scripts/sample_runs.py
"""

from datetime import date

from mrv_engine.biomass import estimate_biomass_from_ndvi
from mrv_engine.carbon import estimate_carbon_sequestered
from mrv_engine.ndvi import generate_ndvi_timeseries

SAMPLE_PROJECTS = [
    {"project_id": "sundarbans-wb-1", "area_hectares": 240.0, "species": "Rhizophora"},
    {"project_id": "pichavaram-tn-2", "area_hectares": 85.0, "species": "Avicennia"},
    {"project_id": "kutch-gj-4", "area_hectares": 40.0, "species": "Mixed"},
]

NUM_PERIODS = 20  # quarterly readings over 5 years — enough to see the full slow/fast/plateau shape


def main() -> None:
    for project in SAMPLE_PROJECTS:
        print(f"\n=== {project['project_id']} | {project['species']} | {project['area_hectares']} ha ===")
        timeseries = generate_ndvi_timeseries(
            project_id=project["project_id"],
            start_date=date(2022, 1, 1),
            num_periods=NUM_PERIODS,
        )

        print(f"{'period':>6}  {'date':<10}  {'ndvi':>6}  {'biomass_t':>10}  {'tonnesCO2':>10}")
        for reading in timeseries:
            biomass_tonnes = estimate_biomass_from_ndvi(
                ndvi_value=reading["ndvi"],
                area_hectares=project["area_hectares"],
                species=project["species"],
            )
            co2_tonnes = estimate_carbon_sequestered(biomass_tonnes)
            print(
                f"{reading['period_index']:>6}  {reading['date']:<10}  {reading['ndvi']:>6.3f}  "
                f"{biomass_tonnes:>10.1f}  {co2_tonnes:>10.1f}"
            )

        first_ndvi = timeseries[0]["ndvi"]
        last_ndvi = timeseries[-1]["ndvi"]
        print(f"  NDVI grew {first_ndvi:.3f} -> {last_ndvi:.3f} over {NUM_PERIODS} periods")


if __name__ == "__main__":
    main()
