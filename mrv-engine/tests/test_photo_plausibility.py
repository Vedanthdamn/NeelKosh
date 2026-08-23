import io

from fastapi.testclient import TestClient
from PIL import Image, ImageDraw

from mrv_engine.api import app
from mrv_engine.photo.plausibility import PLAUSIBILITY_THRESHOLD, check_plausibility, compute_plausibility_score

from .photo_fixtures import make_scene_bytes

client = TestClient(app)


def make_screenshot_bytes(size: tuple[int, int] = (256, 256)) -> bytes:
    """A UI-mockup-like image: white background, gray/blue rectangles — nothing green."""
    image = Image.new("RGB", size, (245, 245, 248))
    draw = ImageDraw.Draw(image)
    draw.rectangle([10, 10, size[0] - 10, 40], fill=(60, 90, 200))  # a "header bar"
    draw.rectangle([10, 60, size[0] - 10, 90], fill=(210, 210, 215))  # a "button"
    draw.rectangle([10, 110, size[0] - 10, 140], fill=(210, 210, 215))
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG")
    return buffer.getvalue()


def make_face_toned_bytes(size: tuple[int, int] = (256, 256)) -> bytes:
    """A solid skin-tone-ish color block — stands in for 'a photo of a person,' not vegetation."""
    image = Image.new("RGB", size, (222, 184, 155))
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG")
    return buffer.getvalue()


def test_vegetation_scene_scores_above_threshold():
    photo = make_scene_bytes(seed=1)
    score = compute_plausibility_score(photo)
    assert score >= PLAUSIBILITY_THRESHOLD


def test_screenshot_scores_near_zero():
    photo = make_screenshot_bytes()
    score = compute_plausibility_score(photo)
    assert score < PLAUSIBILITY_THRESHOLD


def test_face_toned_photo_scores_near_zero():
    photo = make_face_toned_bytes()
    score = compute_plausibility_score(photo)
    assert score < PLAUSIBILITY_THRESHOLD


def test_check_plausibility_returns_rounded_score_and_flag():
    result = check_plausibility(make_scene_bytes(seed=1))
    assert result.is_plausible is True
    assert 0.0 <= result.plausibility_score <= 1.0

    result = check_plausibility(make_screenshot_bytes())
    assert result.is_plausible is False


def test_plausibility_check_endpoint_vegetation():
    response = client.post(
        "/photo/plausibility-check",
        files={"file": ("site.jpg", make_scene_bytes(seed=1), "image/jpeg")},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["is_plausible"] is True
    assert body["plausibility_score"] > 0


def test_plausibility_check_endpoint_screenshot():
    response = client.post(
        "/photo/plausibility-check",
        files={"file": ("screenshot.jpg", make_screenshot_bytes(), "image/jpeg")},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["is_plausible"] is False


def test_plausibility_check_endpoint_rejects_non_image():
    response = client.post(
        "/photo/plausibility-check",
        files={"file": ("not-a-photo.txt", b"hello world", "text/plain")},
    )
    assert response.status_code == 400
