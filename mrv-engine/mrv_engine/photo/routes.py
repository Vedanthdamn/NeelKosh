"""FastAPI routes for the anti-fraud photo checks. See photo/__init__.py for the overall design."""

from __future__ import annotations

import json

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, ValidationError

from .geofence import LatLng, check_geofence

router = APIRouter(prefix="/photo", tags=["photo verification"])


class GeofenceCheckResponse(BaseModel):
    has_gps_data: bool
    latitude: float | None
    longitude: float | None
    location_valid: bool
    distance_from_boundary_meters: float | None
    message: str


def _parse_boundary(boundary_json: str) -> list[LatLng]:
    try:
        raw = json.loads(boundary_json)
    except json.JSONDecodeError as error:
        raise HTTPException(status_code=400, detail=f"boundary is not valid JSON: {error}") from error
    try:
        return [LatLng(**point) for point in raw]
    except (TypeError, ValidationError) as error:
        raise HTTPException(status_code=400, detail=f"boundary must be a JSON array of {{lat, lng}} points: {error}") from error


async def _read_photo(file: UploadFile) -> bytes:
    photo_bytes = await file.read()
    if not photo_bytes:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")
    return photo_bytes


@router.post("/geocheck", response_model=GeofenceCheckResponse)
async def geocheck(
    file: UploadFile = File(..., description="The submitted photo."),
    boundary: str = Form(..., description="JSON array of {lat, lng} points — the project's registered boundary."),
) -> GeofenceCheckResponse:
    """Checks whether a photo's EXIF GPS location falls inside the given project boundary."""
    photo_bytes = await _read_photo(file)
    boundary_points = _parse_boundary(boundary)

    result = check_geofence(photo_bytes, boundary_points)
    return GeofenceCheckResponse(
        has_gps_data=result.has_gps_data,
        latitude=result.latitude,
        longitude=result.longitude,
        location_valid=result.location_valid,
        distance_from_boundary_meters=result.distance_from_boundary_meters,
        message=result.message,
    )
