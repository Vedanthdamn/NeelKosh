"use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import type { Map as LeafletMap, LayerGroup } from "leaflet";
import type { LatLng } from "@/lib/api";

const INDIA_CENTER: LatLng = { lat: 20.5937, lng: 78.9629 };

interface PolygonDrawMapProps {
  points: LatLng[];
  onAddPoint: (point: LatLng) => void;
}

/** Click-to-draw boundary tool: vanilla Leaflet, click adds a vertex, drawn live. No plugin dependency. */
export function PolygonDrawMap({ points, onAddPoint }: PolygonDrawMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const layerGroupRef = useRef<LayerGroup | null>(null);
  const onAddPointRef = useRef(onAddPoint);
  useEffect(() => {
    onAddPointRef.current = onAddPoint;
  }, [onAddPoint]);

  // Mount the map once.
  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;

    import("leaflet").then((L) => {
      if (cancelled || !containerRef.current) return;

      const map = L.map(containerRef.current).setView([INDIA_CENTER.lat, INDIA_CENTER.lng], 5);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(map);

      map.on("click", (event) => {
        onAddPointRef.current({ lat: event.latlng.lat, lng: event.latlng.lng });
      });

      layerGroupRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;
    });

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // Redraw vertex markers and the polygon whenever the point list changes.
  useEffect(() => {
    const layerGroup = layerGroupRef.current;
    if (!layerGroup) return;

    import("leaflet").then((L) => {
      layerGroup.clearLayers();

      points.forEach((point, index) => {
        L.circleMarker([point.lat, point.lng], {
          radius: 6,
          color: "#a97a34",
          weight: 2,
          fillColor: "#d9a756",
          fillOpacity: 1,
        })
          .addTo(layerGroup)
          .bindTooltip(String(index + 1), { permanent: true, direction: "top", offset: [0, -6] });
      });

      if (points.length >= 2) {
        L.polygon(
          points.map((p) => [p.lat, p.lng] as [number, number]),
          { color: "#d9a756", weight: 2, fillColor: "#2f9884", fillOpacity: 0.2 }
        ).addTo(layerGroup);
      }
    });
  }, [points]);

  return <div ref={containerRef} className="h-full w-full rounded-xl" />;
}
