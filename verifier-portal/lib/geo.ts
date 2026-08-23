import type { LatLng } from "./api";

/** Centroid, used to center the geofence map before its polygon bounds are fitted. */
export function boundaryCentroid(boundary: LatLng[]): LatLng {
  const lat = boundary.reduce((sum, p) => sum + p.lat, 0) / boundary.length;
  const lng = boundary.reduce((sum, p) => sum + p.lng, 0) / boundary.length;
  return { lat, lng };
}
