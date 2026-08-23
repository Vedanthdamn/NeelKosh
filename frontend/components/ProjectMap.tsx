"use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import type { LatLng } from "@/lib/api";
import { boundaryCentroid } from "@/lib/geo";

/**
 * Renders a project's boundary on an OpenStreetMap base layer — free, no API key. Leaflet
 * touches `window` on import, so this only ever runs client-side (loaded via next/dynamic with
 * ssr: false wherever it's used). Only draws a polygon, not markers, which sidesteps the classic
 * Leaflet-under-a-bundler broken-default-marker-icon issue entirely.
 */
export function ProjectMap({ boundary }: { boundary: LatLng[] }) {
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

      const latlngs = boundary.map((p) => [p.lat, p.lng] as [number, number]);
      const polygon = L.polygon(latlngs, {
        color: "#d9a756",
        weight: 2.5,
        fillColor: "#2f9884",
        fillOpacity: 0.25,
      }).addTo(map);

      map.fitBounds(polygon.getBounds(), { padding: [28, 28] });
    });

    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [boundary]);

  if (boundary.length < 3) {
    return (
      <div className="flex h-full w-full items-center justify-center rounded-xl bg-mudflat-100 text-sm text-ink-500">
        No boundary recorded for this project.
      </div>
    );
  }

  return <div ref={containerRef} className="h-full w-full rounded-xl" />;
}
