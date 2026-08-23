"""
Geofence check: does a photo's embedded GPS location fall inside the project's registered
boundary?

GPS coordinates come from the photo's EXIF metadata (the GPS tags a phone camera writes
automatically when location services are on), extracted with exifread rather than trusting
anything the uploader typed in a form — the whole point of this check is that the location
claim is baked into the file itself, not asserted by whoever's submitting it.

Distance uses a local planar (equirectangular) projection around the boundary's mean latitude —
the same approximation frontend/lib/geo.ts uses for its own area calculation — rather than a full
geodesic library. Accurate to a fraction of a percent at the scale of a restoration site
boundary (tens to low thousands of meters), which is what this check needs.
"""

from __future__ import annotations

import io
import math
from dataclasses import dataclass

import exifread
from pydantic import BaseModel
from shapely.geometry import Point, Polygon

# A photo whose GPS point falls outside the boundary by less than this is treated as "valid" —
# consumer GPS is commonly accurate to only 5-15 meters, worse under tree canopy, and a
# restoration site boundary drawn by hand on a map is itself an approximation. Rejecting a
# genuinely-on-site photo over a few meters of GPS noise would be a worse failure mode than
# letting a few meters of slack through; the verifier still sees the exact distance either way.
BOUNDARY_TOLERANCE_METERS = 15.0

METERS_PER_DEGREE_LAT = 111_320.0


class LatLng(BaseModel):
    lat: float
    lng: float


@dataclass
class GeofenceResult:
    has_gps_data: bool
    latitude: float | None
    longitude: float | None
    location_valid: bool
    distance_from_boundary_meters: float | None
    message: str


def _ratio_to_float(value) -> float:
    """exifread represents each DMS component as a Ratio (num/den) or, occasionally, a plain number."""
    if hasattr(value, "num") and hasattr(value, "den"):
        return float(value.num) / float(value.den) if value.den else 0.0
    return float(value)


def _dms_to_decimal(dms_values, ref: str) -> float:
    degrees, minutes, seconds = (_ratio_to_float(v) for v in dms_values)
    decimal = degrees + minutes / 60.0 + seconds / 3600.0
    return -decimal if ref in ("S", "W") else decimal


def extract_gps_from_exif(photo_bytes: bytes) -> tuple[float, float] | None:
    """
    Returns (latitude, longitude) in decimal degrees from a photo's EXIF GPS tags, or None if
    the photo has no GPS data at all (location services off, GPS stripped by re-saving/sharing,
    or a non-JPEG format with no EXIF block) — the common, expected case for a photo that just
    doesn't carry location data, not an error condition.
    """
    tags = exifread.process_file(io.BytesIO(photo_bytes), details=False)

    lat_values = tags.get("GPS GPSLatitude")
    lat_ref = tags.get("GPS GPSLatitudeRef")
    lng_values = tags.get("GPS GPSLongitude")
    lng_ref = tags.get("GPS GPSLongitudeRef")

    if not (lat_values and lat_ref and lng_values and lng_ref):
        return None

    try:
        latitude = _dms_to_decimal(lat_values.values, str(lat_ref))
        longitude = _dms_to_decimal(lng_values.values, str(lng_ref))
    except (TypeError, ZeroDivisionError, ValueError):
        return None

    if not (-90.0 <= latitude <= 90.0 and -180.0 <= longitude <= 180.0):
        return None

    return latitude, longitude


def _project_to_meters(lat: float, lng: float, reference_lat: float) -> tuple[float, float]:
    meters_per_degree_lng = METERS_PER_DEGREE_LAT * math.cos(math.radians(reference_lat))
    return lng * meters_per_degree_lng, lat * METERS_PER_DEGREE_LAT


def check_geofence(photo_bytes: bytes, boundary: list[LatLng]) -> GeofenceResult:
    """
    Checks whether a photo's EXIF GPS location falls inside (or within tolerance of) the given
    project boundary polygon.

    A missing GPS tag is reported as its own explicit outcome (has_gps_data=False,
    location_valid=False, distance=None) rather than raised as an error or silently treated as a
    pass — a photo with no location data hasn't proven anything either way, which the human
    verifier needs to see plainly rather than have papered over.
    """
    gps = extract_gps_from_exif(photo_bytes)
    if gps is None:
        return GeofenceResult(
            has_gps_data=False,
            latitude=None,
            longitude=None,
            location_valid=False,
            distance_from_boundary_meters=None,
            message="Photo has no GPS location data in its EXIF metadata.",
        )

    latitude, longitude = gps

    if len(boundary) < 3:
        return GeofenceResult(
            has_gps_data=True,
            latitude=latitude,
            longitude=longitude,
            location_valid=False,
            distance_from_boundary_meters=None,
            message="Project boundary has fewer than 3 points — cannot check containment.",
        )

    reference_lat = sum(p.lat for p in boundary) / len(boundary)
    polygon = Polygon([_project_to_meters(p.lat, p.lng, reference_lat) for p in boundary])
    point = Point(_project_to_meters(latitude, longitude, reference_lat))

    if polygon.covers(point):
        return GeofenceResult(
            has_gps_data=True,
            latitude=latitude,
            longitude=longitude,
            location_valid=True,
            distance_from_boundary_meters=None,
            message="Photo location falls inside the project boundary.",
        )

    distance = polygon.exterior.distance(point)

    if distance <= BOUNDARY_TOLERANCE_METERS:
        return GeofenceResult(
            has_gps_data=True,
            latitude=latitude,
            longitude=longitude,
            location_valid=True,
            distance_from_boundary_meters=round(distance, 1),
            message=f"Photo location is {distance:.1f}m outside the boundary, within the {BOUNDARY_TOLERANCE_METERS:.0f}m GPS-accuracy tolerance.",
        )

    return GeofenceResult(
        has_gps_data=True,
        latitude=latitude,
        longitude=longitude,
        location_valid=False,
        distance_from_boundary_meters=round(distance, 1),
        message=f"Photo location is {distance:.1f}m outside the registered project boundary.",
    )
