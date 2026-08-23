"use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import type { LatLng } from "@/lib/api";
import { boundaryCentroid } from "@/lib/geo";

/**
 * Shows the project's registered boundary, colored by whether the submitted photo's GPS fell
 * inside it. Deliberately does NOT plot a marker for the photo's own location: mrv-engine's
 * geofence check returns a distance-from-boundary in meters, not the photo's raw lat/lng (see
 * mrv_engine/photo/geofence.py) — there is no real coordinate to place a pin at, and a
 * fabricated one would misrepresent precision this system doesn't have. The distance is shown
 * as a labeled figure instead, next to the real boundary shape.
 */
export function GeofenceMap({
  boundary,
  locationValid,
  hasLocationData,
}: {
  boundary: LatLng[];
  locationValid: boolean;
  hasLocationData: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || boundary.length < 3) return;

    let map: import("leaflet").Map | undefined;
    let cancelled = false;

    import("leaflet").then((L) => {
      if (cancelled || !containerRef.current) return;

      const center = boundaryCentroid(boundary);
      map = L.map(containerRef.current, { scrollWheelZoom: false }).setView([center.lat, center.lng], 13);

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(map);

      const color = !hasLocationData ? "#eec04a" : locationValid ? "#46cc75" : "#ef645a";
      const latlngs = boundary.map((p) => [p.lat, p.lng] as [number, number]);
      const polygon = L.polygon(latlngs, { color, weight: 2.5, fillColor: color, fillOpacity: 0.15 }).addTo(map);

      map.fitBounds(polygon.getBounds(), { padding: [24, 24] });
    });

    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [boundary, locationValid, hasLocationData]);

  if (boundary.length < 3) {
    return (
      <div className="flex h-full w-full items-center justify-center rounded bg-slate-800 text-sm text-slate-500">
        No boundary recorded for this project.
      </div>
    );
  }

  return <div ref={containerRef} className="h-full w-full rounded" />;
}
