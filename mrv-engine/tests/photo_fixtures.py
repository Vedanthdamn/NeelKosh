"""Synthetic photo generators for the photo-verification tests. Real JPEG bytes, real EXIF tags
(via piexif) — not mocked data — so the tests exercise the actual exifread/imagehash/Pillow
parsing paths, not just the surrounding logic."""

from __future__ import annotations

import io

import piexif
from PIL import Image


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
