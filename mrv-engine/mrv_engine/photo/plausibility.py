"""
Plausibility check: does this photo even look like vegetation or coastal terrain?

Deliberately not sophisticated — no object detection, no trained model to explain or defend.
Just a color heuristic: convert to HSV and measure what fraction of the image falls in a
green hue range at a reasonable saturation and brightness. Real mangrove, seagrass, and
saltmarsh photos are green-and-brown-dominated; a screenshot, a face, an indoor photo, or a
receipt photographed by mistake generally isn't. This won't catch a deliberately misleading
photo of an unrelated green scene (a lawn, a house plant) — it's a sanity check against
obviously wrong uploads, not a scene classifier, and the plausibility_score it returns is meant
to be read by a human alongside the photo itself, not trusted on its own.
"""

from __future__ import annotations

import io
from dataclasses import dataclass

import numpy as np
from PIL import Image, UnidentifiedImageError

# PIL's "HSV" mode stores hue as 0-255 representing the full 0-360-degree hue circle (255 ~= 360
# degrees), not 0-360 or OpenCV's 0-180. Standard "green" hue is roughly 70-170 degrees
# (yellow-green through blue-green, covering the range real vegetation photographs tend to fall
# in under different lighting); in PIL's units that's about 50-120.
GREEN_HUE_MIN = 50
GREEN_HUE_MAX = 120

# A pixel only counts as "green" if it's also reasonably saturated and reasonably bright — a
# hue value is meaningless noise on a near-gray or near-black pixel (imagine a dark shadow or an
# overcast sky patch that happens to round to a green-ish hue at near-zero saturation). Both are
# 0-255 PIL units.
MIN_SATURATION = 30
MIN_VALUE = 30

# Below this proportion of green pixels, a photo doesn't look like vegetation/coastal terrain at
# all — a blank wall, a screenshot, a face filling most of the frame. This is intentionally a low
# bar: real site photos vary hugely in framing (a wide shot of mostly sky and water over a
# mangrove line reads very differently from a close-up of a seedling), and the goal is to catch
# obviously-wrong uploads, not to grade photo composition.
PLAUSIBILITY_THRESHOLD = 0.10


@dataclass
class PlausibilityResult:
    plausibility_score: float
    is_plausible: bool


def compute_plausibility_score(photo_bytes: bytes) -> float:
    try:
        image = Image.open(io.BytesIO(photo_bytes))
    except UnidentifiedImageError as error:
        raise ValueError("File is not a readable image.") from error

    hsv = np.array(image.convert("RGB").convert("HSV"))
    hue, saturation, value = hsv[:, :, 0], hsv[:, :, 1], hsv[:, :, 2]

    green_mask = (
        (hue >= GREEN_HUE_MIN) & (hue <= GREEN_HUE_MAX) & (saturation >= MIN_SATURATION) & (value >= MIN_VALUE)
    )

    return float(green_mask.sum()) / float(green_mask.size)


def check_plausibility(photo_bytes: bytes) -> PlausibilityResult:
    score = compute_plausibility_score(photo_bytes)
    return PlausibilityResult(
        plausibility_score=round(score, 4),
        is_plausible=bool(score >= PLAUSIBILITY_THRESHOLD),
    )
