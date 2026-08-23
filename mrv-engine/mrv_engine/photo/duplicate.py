"""
Duplicate check: has this project already submitted this photo before — even a recompressed or
slightly-cropped copy of it?

A perceptual hash (imagehash's phash, a frequency-domain fingerprint of the image's visual
content) is used instead of a byte-for-byte hash precisely because fraud here looks like "the
same field photo, re-saved at a different quality or trimmed a little," not "the identical file."
An exact-bytes hash (md5/sha256 of the file) would miss both; phash is robust to exactly that
kind of light editing while still being sensitive to a genuinely different photo.

Storage: mrv-engine has no database of its own (see mrv_engine/__init__.py — every module here is
a stateless function wrapped in FastAPI). The backend is this system's durable store, so the
production-shaped call passes previously-known hashes for a project in explicitly
(known_hashes). An in-memory, per-process fallback store is also kept so this endpoint is
independently testable and demoable without the backend running — see the module-level
_PROJECT_HASH_STORE below. Both paths return the same shape; only where the comparison set comes
from differs.
"""

from __future__ import annotations

import io
from dataclasses import dataclass

import imagehash
from PIL import Image, UnidentifiedImageError

# imagehash's default phash is an 8x8 DCT hash — 64 bits. Kept as a named constant rather than
# reading len(hash) at every call site, and to make the "why 8" visible: larger hash sizes
# (16x16) are more sensitive to small edits but also more likely to flag two honestly different
# photos of the same restoration site as similar; 8x8 is imagehash's own well-tested default for
# exactly this kind of near-duplicate photo detection.
PHASH_SIZE = 8

# Similarity is 1 - (Hamming distance / total bits). 0.90 means the two images differ in at most
# ~10% of their hash bits. This is a real tradeoff, not an arbitrary number:
#   - Too strict (higher, e.g. 0.97+) only catches near-identical bytes, missing the actual fraud
#     case this check exists for — a recompressed or lightly cropped reused photo.
#   - Too loose (lower, e.g. 0.75) starts flagging honestly different photos of the same site
#     taken from a similar angle (the same mangrove creek, a few months apart, looks a lot alike
#     in a coarse visual fingerprint) — which would make legitimate repeat monitoring look like
#     fraud and erode trust in the flag itself.
# 0.90 is a starting point for this demo, not a validated production threshold; a real deployment
# would tune it against a labeled set of genuine repeat-visit photos vs. actual reuse attempts.
DUPLICATE_SIMILARITY_THRESHOLD = 0.90

# Per-process, per-project fallback store: project_id -> list of hex-encoded phash strings.
# Cleared on restart, same as the rest of this stateless service — see module docstring.
_PROJECT_HASH_STORE: dict[str, list[str]] = {}


@dataclass
class DuplicateCheckResult:
    phash: str
    similarity_score: float
    is_duplicate: bool
    compared_against: int


def compute_phash(photo_bytes: bytes) -> imagehash.ImageHash:
    try:
        image = Image.open(io.BytesIO(photo_bytes))
    except UnidentifiedImageError as error:
        raise ValueError("File is not a readable image.") from error
    return imagehash.phash(image, hash_size=PHASH_SIZE)


def similarity_from_hashes(hash_a: imagehash.ImageHash, hash_b: imagehash.ImageHash) -> float:
    total_bits = hash_a.hash.size
    hamming_distance = hash_a - hash_b
    return 1.0 - (hamming_distance / total_bits)


def check_duplicate(
    photo_bytes: bytes,
    project_id: str,
    known_hashes: list[str] | None = None,
) -> DuplicateCheckResult:
    """
    Computes this photo's perceptual hash and compares it against every hash on file for this
    project, returning the highest similarity found.

    known_hashes, when given, is treated as the complete comparison set (the backend's job, once
    wired up — see verification.py). When omitted, this project's own in-memory store is used
    instead, and the new hash is recorded into it for future calls — the fallback that makes this
    endpoint usable on its own.
    """
    new_hash = compute_phash(photo_bytes)

    if known_hashes is not None:
        candidates = known_hashes
    else:
        candidates = _PROJECT_HASH_STORE.setdefault(project_id, [])

    # Snapshot the count before the fallback-store append below: candidates is a *reference* to
    # the stored list in fallback mode, not a copy, so appending to the store also appends to
    # candidates — len(candidates) taken after that append would silently count this submission
    # against itself.
    compared_against = len(candidates)

    best_similarity = 0.0
    for candidate_hex in candidates:
        try:
            candidate_hash = imagehash.hex_to_hash(candidate_hex)
        except ValueError:
            continue
        best_similarity = max(best_similarity, similarity_from_hashes(new_hash, candidate_hash))

    if known_hashes is None:
        _PROJECT_HASH_STORE[project_id].append(str(new_hash))

    return DuplicateCheckResult(
        phash=str(new_hash),
        similarity_score=round(float(best_similarity), 4),
        # bool(...), not the bare numpy.bool_ that ">=" over numpy floats otherwise produces —
        # both compare equal to True/False in Python, but numpy.bool_ is not `is True`, and JSON
        # serialization of numpy scalar types is best not relied on.
        is_duplicate=bool(best_similarity >= DUPLICATE_SIMILARITY_THRESHOLD),
        compared_against=compared_against,
    )
