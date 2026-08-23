"""
Biomass-to-CO2e conversion.

Two well-established, standard conversion steps — not project-specific assumptions:

1. Carbon fraction of dry biomass. Roughly half of a plant's dry mass is carbon; the IPCC's
   default value used across national greenhouse gas inventories is 0.47 (IPCC 2006 Guidelines
   for National Greenhouse Gas Inventories, Volume 4). Mangrove-specific studies sometimes use
   values in the 0.45-0.50 range; 0.47 is the standard default absent site-specific measurement.

2. Carbon-to-CO2 molecular weight ratio. Sequestered carbon is reported as CO2 equivalent
   because that's the unit carbon markets and climate accounting use. One mole of carbon (atomic
   weight 12) forms one mole of CO2 (molecular weight 44: one carbon atom + two oxygen atoms at
   ~16 each) when fully oxidized. So a tonne of pure carbon corresponds to 44/12 (~3.667) tonnes
   of CO2 by mass. This is fixed chemistry, not a tunable parameter — it's written out below as
   an explicit ratio, not folded into a single opaque multiplier, so the two independent
   conversion steps stay auditable separately.

Scope note: the biomass this converts is above-ground biomass (AGB) only — what estimate_biomass_
from_ndvi produces, since NDVI is a canopy-reflectance measurement and can't see roots or soil.
A complete carbon accounting would also include below-ground biomass (typically estimated via a
root-to-shoot ratio) and soil organic carbon — for mangroves specifically, soil carbon stocks
often exceed above-ground biomass carbon by a wide margin, since tidal sediments are a major
carbon sink in their own right. Both are out of scope for this demo; estimate_carbon_sequestered
only accounts for what estimate_biomass_from_ndvi actually estimates.
"""

from __future__ import annotations

# IPCC default carbon fraction of dry biomass.
CARBON_FRACTION_OF_BIOMASS = 0.47

# Molecular weight of CO2 (12 for carbon + 16*2 for two oxygen atoms) over the atomic weight of
# carbon (12). Written as an explicit ratio, not pre-multiplied into CARBON_FRACTION_OF_BIOMASS,
# so each conversion step is visible on its own.
CO2_MOLECULAR_WEIGHT = 44.0
CARBON_ATOMIC_WEIGHT = 12.0


def estimate_carbon_sequestered(biomass_tonnes: float) -> float:
    """
    Converts above-ground biomass to CO2-equivalent sequestered, via elemental carbon.

    Args:
        biomass_tonnes: Above-ground biomass in tonnes. Must be non-negative.

    Returns:
        Tonnes of CO2 equivalent.
    """
    if biomass_tonnes < 0:
        raise ValueError(f"biomass_tonnes must be non-negative, got {biomass_tonnes}")

    # Step 1: biomass -> elemental carbon.
    carbon_tonnes = biomass_tonnes * CARBON_FRACTION_OF_BIOMASS

    # Step 2: elemental carbon -> CO2 equivalent, by molecular weight ratio.
    co2_tonnes = carbon_tonnes * (CO2_MOLECULAR_WEIGHT / CARBON_ATOMIC_WEIGHT)

    return co2_tonnes
