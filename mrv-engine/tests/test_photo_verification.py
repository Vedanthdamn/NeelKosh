import json

from fastapi.testclient import TestClient

from mrv_engine.api import app
from mrv_engine.photo.duplicate import DuplicateCheckResult, _PROJECT_HASH_STORE
from mrv_engine.photo.geofence import GeofenceResult, LatLng
from mrv_engine.photo.plausibility import PlausibilityResult
from mrv_engine.photo.verification import (
    _score_duplicate,
    _score_geofence,
    _score_plausibility,
    verify_submission,
)

from .photo_fixtures import make_jpeg_with_gps, make_scene_bytes, recompress

client = TestClient(app)

CENTER_LAT, CENTER_LNG = 21.9497, 88.9468
BOUNDARY = [
    LatLng(lat=CENTER_LAT + 0.01, lng=CENTER_LNG - 0.01),
    LatLng(lat=CENTER_LAT + 0.01, lng=CENTER_LNG + 0.01),
    LatLng(lat=CENTER_LAT - 0.01, lng=CENTER_LNG + 0.01),
    LatLng(lat=CENTER_LAT - 0.01, lng=CENTER_LNG - 0.01),
]
BOUNDARY_JSON = json.dumps([p.model_dump() for p in BOUNDARY])


# --- Unit tests for each check's severity contribution, with constructed inputs so every branch
# --- (clear / review / reject) is hit deterministically rather than hoping an image lands there.


def test_score_geofence_inside_is_clear():
    result = GeofenceResult(True, CENTER_LAT, CENTER_LNG, True, None, "inside")
    assert _score_geofence(result, []) == 0


def test_score_geofence_no_gps_is_review():
    result = GeofenceResult(False, None, None, False, None, "no gps")
    reasons = []
    assert _score_geofence(result, reasons) == 1
    assert reasons


def test_score_geofence_slightly_outside_is_review():
    result = GeofenceResult(True, CENTER_LAT, CENTER_LNG, False, 100.0, "100m outside")
    assert _score_geofence(result, []) == 1


def test_score_geofence_far_outside_is_reject():
    result = GeofenceResult(True, CENTER_LAT, CENTER_LNG, False, 5000.0, "5km outside")
    assert _score_geofence(result, []) == 2


def test_score_duplicate_below_review_threshold_is_clear():
    result = DuplicateCheckResult("abc", 0.5, False, 3)
    assert _score_duplicate(result, []) == 0


def test_score_duplicate_near_duplicate_is_review():
    result = DuplicateCheckResult("abc", 0.85, False, 3)
    assert _score_duplicate(result, []) == 1


def test_score_duplicate_flagged_is_reject():
    result = DuplicateCheckResult("abc", 0.95, True, 3)
    assert _score_duplicate(result, []) == 2


def test_score_plausibility_normal_is_clear():
    result = PlausibilityResult(0.4, True)
    assert _score_plausibility(result, []) == 0


def test_score_plausibility_low_is_review():
    result = PlausibilityResult(0.06, False)
    assert _score_plausibility(result, []) == 1


def test_score_plausibility_near_zero_is_reject():
    result = PlausibilityResult(0.005, False)
    assert _score_plausibility(result, []) == 2


# --- Integration-level tests with real generated photos, through the actual pipeline.


def _clear_photo():
    return make_jpeg_with_gps(CENTER_LAT, CENTER_LNG, color=(60, 140, 50), size=(128, 128))


def test_verify_submission_all_clear():
    result = verify_submission(_clear_photo(), project_id="verify-clear", boundary=BOUNDARY)
    assert result.overall_flag == "clear"
    assert result.location_valid is True
    assert result.is_duplicate is False
    assert len(result.reasons) == 1  # the single "no issues found" reason


def test_verify_submission_rejects_duplicate():
    _PROJECT_HASH_STORE.pop("verify-dup", None)
    original = _clear_photo()
    verify_submission(original, project_id="verify-dup", boundary=BOUNDARY)

    reused = recompress(original, quality=40)
    result = verify_submission(reused, project_id="verify-dup", boundary=BOUNDARY)

    assert result.overall_flag == "reject"
    assert result.is_duplicate is True
    assert any("duplicate" in reason.lower() for reason in result.reasons)


def test_verify_submission_rejects_wrong_location():
    far_away_photo = make_jpeg_with_gps(CENTER_LAT, CENTER_LNG + 1.0, color=(60, 140, 50))
    result = verify_submission(far_away_photo, project_id="verify-location", boundary=BOUNDARY)

    assert result.overall_flag == "reject"
    assert result.location_valid is False
    assert any("boundary" in reason.lower() for reason in result.reasons)


def test_verify_submission_reviews_missing_gps():
    no_gps_photo = make_scene_bytes(seed=1)  # make_scene_bytes never embeds EXIF
    result = verify_submission(no_gps_photo, project_id="verify-no-gps", boundary=BOUNDARY)

    assert result.overall_flag in ("review", "reject")  # depends on this scene's plausibility score too
    assert result.has_location_data is False
    assert any("no gps" in reason.lower() for reason in result.reasons)


def test_verify_submission_endpoint_end_to_end():
    photo = _clear_photo()
    response = client.post(
        "/photo/verify-submission",
        files={"file": ("site.jpg", photo, "image/jpeg")},
        data={"project_id": "verify-endpoint-test", "boundary": BOUNDARY_JSON},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["overallFlag"] == "clear"
    assert body["locationValid"] is True
    assert body["distanceFromBoundary"] is None
    assert body["isDuplicate"] is False
    assert body["hasLocationData"] is True
    assert isinstance(body["reasons"], list) and len(body["reasons"]) > 0


def test_verify_submission_endpoint_flags_reused_photo():
    photo = _clear_photo()
    client.post(
        "/photo/verify-submission",
        files={"file": ("first.jpg", photo, "image/jpeg")},
        data={"project_id": "verify-endpoint-dup", "boundary": BOUNDARY_JSON},
    )
    response = client.post(
        "/photo/verify-submission",
        files={"file": ("second.jpg", recompress(photo, quality=40), "image/jpeg")},
        data={"project_id": "verify-endpoint-dup", "boundary": BOUNDARY_JSON},
    )
    body = response.json()
    assert body["overallFlag"] == "reject"
    assert body["isDuplicate"] is True
