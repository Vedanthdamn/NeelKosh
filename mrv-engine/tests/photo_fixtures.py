"""Synthetic photo generators for the photo-verification tests. Real JPEG bytes, real EXIF tags
(via piexif) — not mocked data — so the tests exercise the actual exifread/imagehash/Pillow
parsing paths, not just the surrounding logic."""

from __future__ import annotations

import io

import piexif
from PIL import Image, ImageDraw


def make_scene_bytes(seed: int = 0, size: tuple[int, int] = (256, 256), quality: int = 90) -> bytes:
    """
    A synthetic 'field photo' with actual spatial structure (a gradient plus a few shapes),
    not a flat color — a solid-color image barely exercises a perceptual hash, since there's no
    spatial content for it to fingerprint. `seed` shifts the shapes and gradient so different
    seeds produce visually distinct scenes, for testing that genuinely different photos don't
    get flagged as duplicates of each other.
    """
    image = Image.new("RGB", size, (135, 175, 90))  # a muted green ground tone
    draw = ImageDraw.Draw(image)

    # A horizon gradient (sky over ground), shifted per seed.
    horizon = size[1] // 2 + (seed * 7) % 40
    for y in range(horizon):
        shade = 180 - int(60 * y / max(horizon, 1))
        draw.line([(0, y), (size[0], y)], fill=(shade, shade + 20, 220))

    # A few "vegetation" blobs whose position depends on the seed.
    for i in range(4):
        x = (30 + seed * 13 + i * 47) % size[0]
        y = horizon + (10 + seed * 5 + i * 23) % (size[1] - horizon)
        radius = 15 + (i * 7 + seed) % 20
        draw.ellipse([x - radius, y - radius, x + radius, y + radius], fill=(60 + seed % 40, 120, 40))

    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", quality=quality)
    return buffer.getvalue()


def recompress(photo_bytes: bytes, quality: int = 40) -> bytes:
    """Re-saves a photo at a different JPEG quality — the 'recompressed reused photo' fraud case."""
    image = Image.open(io.BytesIO(photo_bytes))
    buffer = io.BytesIO()
    image.convert("RGB").save(buffer, format="JPEG", quality=quality)
    return buffer.getvalue()


def crop_slightly(photo_bytes: bytes, fraction: float = 0.03) -> bytes:
    """Crops a small border off a photo and resizes back — the 'slightly-cropped reused photo' case."""
    image = Image.open(io.BytesIO(photo_bytes))
    width, height = image.size
    dx, dy = int(width * fraction), int(height * fraction)
    cropped = image.crop((dx, dy, width - dx, height - dy)).resize((width, height))
    buffer = io.BytesIO()
    cropped.convert("RGB").save(buffer, format="JPEG", quality=90)
    return buffer.getvalue()


def make_jpeg_bytes(color: tuple[int, int, int] = (34, 139, 34), size: tuple[int, int] = (64, 64)) -> bytes:
    """A plain solid-color JPEG with no EXIF. Defaults to forest green."""
    image = Image.new("RGB", size, color)
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG")
    return buffer.getvalue()


def _decimal_to_dms_rational(value: float) -> tuple[list[tuple[int, int]], bool]:
    is_positive = value >= 0
    value = abs(value)
    degrees = int(value)
    minutes_float = (value - degrees) * 60
    minutes = int(minutes_float)
    seconds = (minutes_float - minutes) * 60
    # piexif rationals are (numerator, denominator) pairs; seconds gets 2 decimal places of precision.
    return [(degrees, 1), (minutes, 1), (int(round(seconds * 100)), 100)], is_positive


def make_jpeg_with_gps(
    lat: float, lng: float, color: tuple[int, int, int] = (34, 139, 34), size: tuple[int, int] = (64, 64)
) -> bytes:
    """A JPEG with real EXIF GPS tags at the given decimal-degree coordinates."""
    lat_dms, lat_positive = _decimal_to_dms_rational(lat)
    lng_dms, lng_positive = _decimal_to_dms_rational(lng)

    exif_dict = {
        "GPS": {
            piexif.GPSIFD.GPSLatitudeRef: "N" if lat_positive else "S",
            piexif.GPSIFD.GPSLatitude: lat_dms,
            piexif.GPSIFD.GPSLongitudeRef: "E" if lng_positive else "W",
            piexif.GPSIFD.GPSLongitude: lng_dms,
        }
    }
    exif_bytes = piexif.dump(exif_dict)

    image = Image.new("RGB", size, color)
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", exif=exif_bytes)
    return buffer.getvalue()
