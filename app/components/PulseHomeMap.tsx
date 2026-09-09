"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { CATEGORIES, migrateCategory } from "@/lib/categories";
import type { CivicEvent, Organization, Project } from "@/lib/types";

const MapContainer = dynamic(
  () => import("react-leaflet").then((m) => m.MapContainer),
  { ssr: false }
);
const TileLayer = dynamic(
  () => import("react-leaflet").then((m) => m.TileLayer),
  { ssr: false }
);
const CircleMarker = dynamic(
  () => import("react-leaflet").then((m) => m.CircleMarker),
  { ssr: false }
);
const AttributionControl = dynamic(
  () => import("react-leaflet").then((m) => m.AttributionControl),
  { ssr: false }
);

const LAFAYETTE_CENTER: [number, number] = [37.8935, -122.1178];
const DEFAULT_ZOOM = 13;
const EVENT_COLOR = "#D97706";
const ORG_COLOR = "#364f37";

function hasCoords(item: { latitude?: number | null; longitude?: number | null }) {
  return item.latitude != null && item.longitude != null;
}

function asList<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === "object" && Array.isArray((data as { items?: unknown }).items)) {
    return (data as { items: T[] }).items;
  }
  return [];
}

export default function PulseHomeMap() {
  const [mounted, setMounted] = useState(false);
  const [events, setEvents] = useState<CivicEvent[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/api/events?limit=100&upcoming=true")
        .then((res) => res.json())
        .catch(() => []),
      fetch("/api/organizations?limit=100")
        .then((res) => res.json())
        .catch(() => ({ items: [] })),
      fetch("/api/projects")
        .then((res) => res.json())
        .catch(() => []),
    ]).then(([eventData, orgData, projectData]) => {
      if (cancelled) return;
      setEvents(asList<CivicEvent>(eventData).filter(hasCoords));
      setOrganizations(asList<Organization>(orgData).filter(hasCoords));
      setProjects(asList<Project>(projectData).filter(hasCoords));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!mounted) {
    return <div className="w-full h-full bg-canvas" aria-hidden="true" />;
  }

  return (
    <div className="relative w-full h-full pulse-home-map map-bleed">
      <MapContainer
        center={LAFAYETTE_CENTER}
        zoom={DEFAULT_ZOOM}
        className="w-full h-full z-0"
        scrollWheelZoom={false}
        dragging={false}
        doubleClickZoom={false}
        zoomControl={false}
        attributionControl={false}
        keyboard={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <AttributionControl position="bottomleft" prefix={false} />

        {events.map((event) => (
          <CircleMarker
            key={`event-${event.id}`}
            center={[event.latitude!, event.longitude!]}
            radius={7}
            pathOptions={{
              color: EVENT_COLOR,
              fillColor: EVENT_COLOR,
              fillOpacity: 0.75,
              weight: 2,
            }}
          />
        ))}

        {organizations.map((org) => (
          <CircleMarker
            key={`org-${org.id}`}
            center={[org.latitude!, org.longitude!]}
            radius={7}
            pathOptions={{
              color: ORG_COLOR,
              fillColor: ORG_COLOR,
              fillOpacity: 0.75,
              weight: 2,
            }}
          />
        ))}

        {projects.map((project) => {
          const cat = CATEGORIES[migrateCategory(project.category)];
          return (
            <CircleMarker
              key={`project-${project.id}`}
              center={[project.latitude!, project.longitude!]}
              radius={7}
              pathOptions={{
                color: cat.color,
                fillColor: cat.color,
                fillOpacity: 0.65,
                weight: 2,
              }}
            />
          );
        })}
      </MapContainer>
    </div>
  );
}
