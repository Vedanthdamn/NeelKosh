import type { LatLng } from "./api";

/**
 * Approximate area of a lat/lng polygon in hectares. ProjectRegistry doesn't store an area
 * field — only the boundary polygon — so this derives area from the real, on-chain boundary
 * rather than a fabricated number.
 *
 * Uses a planar (equirectangular) approximation: degrees are converted to meters using the
 * local meters-per-degree at the polygon's mean latitude, then the shoelace formula gives
 * planar area. This is accurate to a fraction of a percent for anything under a few hundred
 * hectares — plenty for a restoration site — and avoids pulling in a full geodesic library for
 * a display-only figure.
 */
export function polygonAreaHectares(boundary: LatLng[]): number {
  if (boundary.length < 3) return 0;

  const meanLatRad = (boundary.reduce((sum, p) => sum + p.lat, 0) / boundary.length) * (Math.PI / 180);
  const metersPerDegLat = 111_320;
  const metersPerDegLng = 111_320 * Math.cos(meanLatRad);

  const points = boundary.map((p) => ({ x: p.lng * metersPerDegLng, y: p.lat * metersPerDegLat }));

  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    area += a.x * b.y - b.x * a.y;
  }
  const squareMeters = Math.abs(area) / 2;

  return squareMeters / 10_000;
}

/** Bounding box for fitting a map view to a polygon. */
export function boundaryBounds(boundary: LatLng[]): [[number, number], [number, number]] {
  const lats = boundary.map((p) => p.lat);
  const lngs = boundary.map((p) => p.lng);
  return [
    [Math.min(...lats), Math.min(...lngs)],
    [Math.max(...lats), Math.max(...lngs)],
  ];
}

/** Centroid, used to place a marker or center a map before bounds are known. */
export function boundaryCentroid(boundary: LatLng[]): LatLng {
  const lat = boundary.reduce((sum, p) => sum + p.lat, 0) / boundary.length;
  const lng = boundary.reduce((sum, p) => sum + p.lng, 0) / boundary.length;
  return { lat, lng };
}
