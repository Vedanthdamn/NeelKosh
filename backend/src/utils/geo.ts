export interface LatLng {
  lat: number;
  lng: number;
}

const DEGREE_TO_E6 = 1_000_000;

/** Converts a decimal-degree point to the [latitudeE6, longitudeE6] tuple ProjectRegistry expects. */
export function toMicrodegreeTuple(point: LatLng): [number, number] {
  return [Math.round(point.lat * DEGREE_TO_E6), Math.round(point.lng * DEGREE_TO_E6)];
}

/** Converts a ProjectRegistry GeoPoint (or [lat, lng] tuple) back to decimal degrees. */
export function fromMicrodegree(point: { latitudeE6: bigint | number; longitudeE6: bigint | number }): LatLng {
  return {
    lat: Number(point.latitudeE6) / DEGREE_TO_E6,
    lng: Number(point.longitudeE6) / DEGREE_TO_E6,
  };
}
