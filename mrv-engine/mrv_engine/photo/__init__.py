"""
Anti-fraud photo verification for MRV submissions.

Three independent, explainable checks — not a black-box model. Each one is a simple rule over a
measurable quantity (a GPS coordinate, a bit-difference between two hashes, a pixel-color
proportion), and each result comes with a plain-English reason. A human verifier — or a judge
asking "why did this fail" — can read the reasoning directly off the numbers, not trust a score
that hides its logic.

    geofence.py       — does the photo's EXIF GPS location fall inside the project boundary?
    duplicate.py       — is this photo (or a crop/recompression of it) one we've already seen?
    plausibility.py    — does the photo even look like vegetation/coastal terrain?
    verification.py    — combines all three into one clear / review / reject recommendation

None of these checks approve or reject a submission by themselves. See verification.py's
module docstring and backend/src/routes/mrv.ts for why that's a deliberate boundary, not a gap.
"""
