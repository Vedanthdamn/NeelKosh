"""FastAPI routes for the anti-fraud photo checks. See photo/__init__.py for the overall design."""

from __future__ import annotations

import json

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, ValidationError

from .duplicate import check_duplicate
from .geofence import LatLng, check_geofence

router = APIRouter(prefix="/photo", tags=["photo verification"])


class GeofenceCheckResponse(BaseModel):
    has_gps_data: bool
    latitude: float | None
    longitude: float | None
    location_valid: bool
    distance_from_boundary_meters: float | None
    message: str


class DuplicateCheckResponse(BaseModel):
    phash: str
    similarity_score: float
    is_duplicate: bool
    compared_against: int


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


def _parse_known_hashes(known_hashes_json: str | None) -> list[str] | None:
    """None means 'use mrv-engine's own fallback store'; see duplicate.py. A caller that has no
    prior hashes yet for a project (its first submission) should pass "[]", not omit the field —
    that's what actually selects backend-supplied mode with an empty comparison set."""
    if known_hashes_json is None:
        return None
    try:
        raw = json.loads(known_hashes_json)
    except json.JSONDecodeError as error:
        raise HTTPException(status_code=400, detail=f"known_hashes is not valid JSON: {error}") from error
    if not isinstance(raw, list) or not all(isinstance(item, str) for item in raw):
        raise HTTPException(status_code=400, detail="known_hashes must be a JSON array of strings.")
    return raw


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


@router.post("/duplicate-check", response_model=DuplicateCheckResponse)
async def duplicate_check(
    file: UploadFile = File(..., description="The submitted photo."),
    project_id: str = Form(..., description="Which project's photo history to compare against."),
    known_hashes: str | None = Form(
        None, description="Optional JSON array of previously-known hex phash strings for this project. Omit to use mrv-engine's own per-process store instead."
    ),
) -> DuplicateCheckResponse:
    """Computes a perceptual hash of the photo and flags it if it's too similar to one already on file for this project."""
    photo_bytes = await _read_photo(file)
    hashes = _parse_known_hashes(known_hashes)

    try:
        result = check_duplicate(photo_bytes, project_id, known_hashes=hashes)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error

    return DuplicateCheckResponse(
        phash=result.phash,
        similarity_score=result.similarity_score,
        is_duplicate=result.is_duplicate,
        compared_against=result.compared_against,
    )
