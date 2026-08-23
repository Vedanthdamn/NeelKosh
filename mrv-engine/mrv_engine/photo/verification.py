"""
Combines the geofence, duplicate, and plausibility checks into one recommendation for the human
verifier.

This file does not approve or reject anything. overallFlag is advisory — "clear" means nothing
suspicious turned up, "review" means something is worth a closer look, "reject" means something
is a strong enough signal that a verifier should treat the submission with real suspicion — but
in every case a human still makes the actual call. The wiring in backend/src/routes/mrv.ts stores
this result alongside the submission and shows it to the verifier; it never blocks or
auto-approves a submission on its own. See that file's comments for why: none of these three
checks can prove a claim is true, only that nothing measurable here contradicts it, and a system
that let a script silently reject submissions would be exactly the black box this feature is
built to avoid.

overallFlag is decided by explicit severity levels, not a weighted score a person would have to
reverse-engineer: each check can push the result toward "review" or "reject" for a stated reason,
the most severe outcome across all three wins, and every reason that fired is returned — not just
the first one — so a verifier sees the whole picture, not a single symptom.
"""

from __future__ import annotations

from dataclasses import dataclass

from .duplicate import DuplicateCheckResult, check_duplicate
from .geofence import GeofenceResult, LatLng, check_geofence
from .plausibility import PLAUSIBILITY_THRESHOLD, PlausibilityResult, check_plausibility

# A photo whose GPS point is further than this from the boundary is treated as a strong signal,
# not just a borderline one — geofence.py's own BOUNDARY_TOLERANCE_METERS (15m) already absorbs
# ordinary GPS noise, so anything failing that check is already somewhat suspicious; this second,
# much larger threshold is where "somewhat suspicious" becomes "clearly a different location."
GEOFENCE_HARD_REJECT_METERS = 500.0

# Below this, a photo shows essentially no vegetation-like coloring at all — not just "unusually
# little" (plausibility.py's own PLAUSIBILITY_THRESHOLD, 0.10, already flags that for review) but
# close enough to zero that it's a stronger signal the photo doesn't belong to this claim at all.
PLAUSIBILITY_HARD_REJECT_THRESHOLD = 0.02

# A similarity below the actual duplicate threshold (duplicate.py's 0.90) but still notably high
# is worth a verifier's attention even though it doesn't meet the bar to call it a duplicate
# outright — two honestly different photos of the same restoration site can score moderately
# similar just from sharing a lot of sky/water/mud, so this is set well above that noise floor.
NEAR_DUPLICATE_REVIEW_THRESHOLD = 0.80

OverallFlag = str  # "clear" | "review" | "reject" — kept as str for easy FastAPI/Pydantic reuse.

_FLAG_BY_SEVERITY = ("clear", "review", "reject")


@dataclass
class SubmissionVerificationResult:
    location_valid: bool
    distance_from_boundary_meters: float | None
    has_location_data: bool
    is_duplicate: bool
    similarity_score: float
    photo_hash: str
    plausibility_score: float
    overall_flag: OverallFlag
    reasons: list[str]


def _score_geofence(result: GeofenceResult, reasons: list[str]) -> int:
    if not result.has_gps_data:
        reasons.append("Photo has no GPS location data — cannot confirm it was taken on site.")
        return 1

    if result.location_valid:
        return 0

    distance = result.distance_from_boundary_meters or 0.0
    if distance > GEOFENCE_HARD_REJECT_METERS:
        reasons.append(
            f"Photo location is {distance:.0f}m outside the project boundary — well beyond plausible GPS error."
        )
        return 2

    reasons.append(f"Photo location is {distance:.0f}m outside the project boundary.")
    return 1


def _score_duplicate(result: DuplicateCheckResult, reasons: list[str]) -> int:
    if result.is_duplicate:
        reasons.append(
            f"Photo is a likely duplicate of a previous submission for this project "
            f"({result.similarity_score:.0%} visual similarity, {result.compared_against} compared)."
        )
        return 2

    if result.similarity_score >= NEAR_DUPLICATE_REVIEW_THRESHOLD:
        reasons.append(
            f"Photo is visually similar to a previous submission ({result.similarity_score:.0%}), "
            "below the duplicate threshold but close enough to warrant a look."
        )
        return 1

    return 0


def _score_plausibility(result: PlausibilityResult, reasons: list[str]) -> int:
    if result.plausibility_score < PLAUSIBILITY_HARD_REJECT_THRESHOLD:
        reasons.append("Photo shows almost no vegetation-like coloring — doesn't look like a site photo at all.")
        return 2

    if result.plausibility_score < PLAUSIBILITY_THRESHOLD:
        reasons.append(f"Photo shows relatively little vegetation-like coloring ({result.plausibility_score:.0%}).")
        return 1

    return 0


def verify_submission(
    photo_bytes: bytes,
    project_id: str,
    boundary: list[LatLng],
    known_hashes: list[str] | None = None,
) -> SubmissionVerificationResult:
    """Runs all three checks against one photo and combines them into one advisory result."""
    geofence_result = check_geofence(photo_bytes, boundary)
    duplicate_result = check_duplicate(photo_bytes, project_id, known_hashes=known_hashes)
    plausibility_result = check_plausibility(photo_bytes)

    reasons: list[str] = []
    severity = max(
        _score_geofence(geofence_result, reasons),
        _score_duplicate(duplicate_result, reasons),
        _score_plausibility(plausibility_result, reasons),
    )

    if severity == 0:
        reasons.append("No issues found: location confirmed on site, no duplicate detected, photo content looks plausible.")

    return SubmissionVerificationResult(
        location_valid=geofence_result.location_valid,
        distance_from_boundary_meters=geofence_result.distance_from_boundary_meters,
        has_location_data=geofence_result.has_gps_data,
        is_duplicate=duplicate_result.is_duplicate,
        similarity_score=duplicate_result.similarity_score,
        photo_hash=duplicate_result.phash,
        plausibility_score=plausibility_result.plausibility_score,
        overall_flag=_FLAG_BY_SEVERITY[severity],
        reasons=reasons,
    )
