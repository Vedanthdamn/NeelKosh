import json

import pytest
from fastapi.testclient import TestClient

from mrv_engine.api import app
from mrv_engine.photo.geofence import LatLng, check_geofence, extract_gps_from_exif

from .photo_fixtures import make_jpeg_bytes, make_jpeg_with_gps

client = TestClient(app)

# A small square around the Sundarbans, matching the coordinates used elsewhere in the demo data.
CENTER_LAT, CENTER_LNG = 21.9497, 88.9468
BOUNDARY = [
    LatLng(lat=CENTER_LAT + 0.01, lng=CENTER_LNG - 0.01),
    LatLng(lat=CENTER_LAT + 0.01, lng=CENTER_LNG + 0.01),
    LatLng(lat=CENTER_LAT - 0.01, lng=CENTER_LNG + 0.01),
    LatLng(lat=CENTER_LAT - 0.01, lng=CENTER_LNG - 0.01),
]
BOUNDARY_JSON = json.dumps([p.model_dump() for p in BOUNDARY])


def test_extract_gps_from_exif_reads_real_tags():
    photo = make_jpeg_with_gps(CENTER_LAT, CENTER_LNG)
    result = extract_gps_from_exif(photo)
    assert result is not None
    lat, lng = result
    assert lat == pytest.approx(CENTER_LAT, abs=0.001)
    assert lng == pytest.approx(CENTER_LNG, abs=0.001)


def test_extract_gps_from_exif_returns_none_without_gps():
    photo = make_jpeg_bytes()
    assert extract_gps_from_exif(photo) is None


def test_check_geofence_point_inside_boundary():
    photo = make_jpeg_with_gps(CENTER_LAT, CENTER_LNG)
    result = check_geofence(photo, BOUNDARY)
    assert result.has_gps_data is True
    assert result.location_valid is True
    assert result.distance_from_boundary_meters is None


def test_check_geofence_point_far_outside_boundary():
    # Roughly 1.1km east of the boundary — well past both the boundary and the GPS tolerance.
    photo = make_jpeg_with_gps(CENTER_LAT, CENTER_LNG + 0.02)
    result = check_geofence(photo, BOUNDARY)
    assert result.has_gps_data is True
    assert result.location_valid is False
    assert result.distance_from_boundary_meters > 500


def test_check_geofence_point_just_outside_is_within_tolerance():
    # A few meters outside the boundary edge — within GPS-accuracy tolerance, should still pass.
    photo = make_jpeg_with_gps(CENTER_LAT, CENTER_LNG + 0.0101)
    result = check_geofence(photo, BOUNDARY)
    assert result.has_gps_data is True
    assert result.location_valid is True
    assert result.distance_from_boundary_meters is not None
    assert result.distance_from_boundary_meters <= 15.0


def test_check_geofence_no_gps_data_is_explicit_not_a_crash():
    photo = make_jpeg_bytes()
    result = check_geofence(photo, BOUNDARY)
    assert result.has_gps_data is False
    assert result.location_valid is False
    assert result.distance_from_boundary_meters is None
    assert "no gps" in result.message.lower()


def test_geocheck_endpoint_inside_boundary():
    photo = make_jpeg_with_gps(CENTER_LAT, CENTER_LNG)
    response = client.post(
        "/photo/geocheck",
        files={"file": ("site.jpg", photo, "image/jpeg")},
        data={"boundary": BOUNDARY_JSON},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["has_gps_data"] is True
    assert body["location_valid"] is True
    assert body["distance_from_boundary_meters"] is None


def test_geocheck_endpoint_outside_boundary():
    photo = make_jpeg_with_gps(CENTER_LAT, CENTER_LNG + 0.02)
    response = client.post(
        "/photo/geocheck",
        files={"file": ("site.jpg", photo, "image/jpeg")},
        data={"boundary": BOUNDARY_JSON},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["location_valid"] is False
    assert body["distance_from_boundary_meters"] > 500


def test_geocheck_endpoint_no_gps():
    photo = make_jpeg_bytes()
    response = client.post(
        "/photo/geocheck",
        files={"file": ("site.jpg", photo, "image/jpeg")},
        data={"boundary": BOUNDARY_JSON},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["has_gps_data"] is False
    assert body["location_valid"] is False


def test_geocheck_endpoint_rejects_malformed_boundary():
    photo = make_jpeg_with_gps(CENTER_LAT, CENTER_LNG)
    response = client.post(
        "/photo/geocheck",
        files={"file": ("site.jpg", photo, "image/jpeg")},
        data={"boundary": "not json"},
    )
    assert response.status_code == 400


def test_geocheck_endpoint_rejects_empty_file():
    response = client.post(
        "/photo/geocheck",
        files={"file": ("site.jpg", b"", "image/jpeg")},
        data={"boundary": BOUNDARY_JSON},
    )
    assert response.status_code == 400
