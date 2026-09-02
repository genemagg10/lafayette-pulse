"use client";

import { useEffect, useMemo, useState } from "react";
import { CATEGORIES } from "@/lib/categories";
import { ORG_TYPE_LABELS, type CivicEvent, type Organization, type Project } from "@/lib/types";

import dynamic from "next/dynamic";

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
const Popup = dynamic(
  () => import("react-leaflet").then((m) => m.Popup),
  { ssr: false }
);

const LAFAYETTE_CENTER: [number, number] = [37.8935, -122.1178];
const DEFAULT_ZOOM = 14;

const EVENT_COLOR = "#D97706";
const ORG_COLOR = "#364f37";

export type MapLayerId = "events" | "organizations" | "projects";

export interface MapLayers {
  events: boolean;
  organizations: boolean;
  projects: boolean;
}

export const DEFAULT_MAP_LAYERS: MapLayers = {
  events: true,
  organizations: true,
  projects: false,
};

interface ProjectMapProps {
  projects: Project[];
  onSelectProject: (project: Project) => void;
  selectedProjectId?: number | null;
  layers: MapLayers;
  onToggleLayer: (id: MapLayerId) => void;
}

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

export default function ProjectMap({
  projects,
  onSelectProject,
  selectedProjectId,
  layers,
  onToggleLayer,
}: ProjectMapProps) {
  const [mounted, setMounted] = useState(false);
  const [events, setEvents] = useState<CivicEvent[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);

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
    ]).then(([eventData, orgData]) => {
      if (cancelled) return;
      setEvents(asList<CivicEvent>(eventData).filter(hasCoords));
      setOrganizations(asList<Organization>(orgData).filter(hasCoords));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const mappedProjects = useMemo(
    () => projects.filter(hasCoords),
    [projects]
  );

  if (!mounted) {
    return (
      <div className="w-full h-full bg-cream-100 flex items-center justify-center rounded-lg">
        <p className="text-forest-400 font-body">Loading map...</p>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full">
      <div className="absolute top-3 right-3 z-[1000] rounded-lg border border-cream-200 bg-white/95 shadow-sm p-2 space-y-1">
        <p className="text-[10px] uppercase tracking-wide text-forest-400 font-body px-1">
          Layers
        </p>
        <LayerToggle
          label="Events"
          swatch={EVENT_COLOR}
          checked={layers.events}
          onChange={() => onToggleLayer("events")}
        />
        <LayerToggle
          label="Organizations"
          swatch={ORG_COLOR}
          checked={layers.organizations}
          onChange={() => onToggleLayer("organizations")}
        />
        <LayerToggle
          label="Projects"
          swatch="#567a58"
          checked={layers.projects}
          onChange={() => onToggleLayer("projects")}
        />
      </div>

      <MapContainer
        center={LAFAYETTE_CENTER}
        zoom={DEFAULT_ZOOM}
        className="w-full h-full rounded-lg z-0"
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {layers.events &&
          events.map((event) => (
            <CircleMarker
              key={`event-${event.id}`}
              center={[event.latitude!, event.longitude!]}
              radius={8}
              pathOptions={{
                color: EVENT_COLOR,
                fillColor: EVENT_COLOR,
                fillOpacity: 0.75,
                weight: 2,
              }}
            >
              <Popup>
                <div className="font-body text-sm">
                  <p className="text-[10px] uppercase tracking-wide text-forest-400">
                    Event
                  </p>
                  <p className="font-bold text-forest-800">{event.title}</p>
                  {event.starts_at && (
                    <p className="text-forest-600 text-xs mt-1">
                      {new Date(event.starts_at).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </p>
                  )}
                  {event.location_name && (
                    <p className="text-forest-500 text-xs mt-0.5">
                      {event.location_name}
                    </p>
                  )}
                </div>
              </Popup>
            </CircleMarker>
          ))}

        {layers.organizations &&
          organizations.map((org) => (
            <CircleMarker
              key={`org-${org.id}`}
              center={[org.latitude!, org.longitude!]}
              radius={8}
              pathOptions={{
                color: ORG_COLOR,
                fillColor: ORG_COLOR,
                fillOpacity: 0.75,
                weight: 2,
              }}
            >
              <Popup>
                <div className="font-body text-sm">
                  <p className="text-[10px] uppercase tracking-wide text-forest-400">
                    Organization
                  </p>
                  <p className="font-bold text-forest-800">{org.name}</p>
                  <p className="text-forest-600 text-xs mt-1">
                    {ORG_TYPE_LABELS[org.org_type] ?? org.org_type}
                  </p>
                  {org.location_name && (
                    <p className="text-forest-500 text-xs mt-0.5">
                      {org.location_name}
                    </p>
                  )}
                </div>
              </Popup>
            </CircleMarker>
          ))}

        {layers.projects &&
          mappedProjects.map((project) => {
            const cat = CATEGORIES[project.category];
            const isSelected = project.id === selectedProjectId;
            const isInProgress = project.status === "in_progress";

            return (
              <CircleMarker
                key={`project-${project.id}`}
                center={[project.latitude!, project.longitude!]}
                radius={isSelected ? 12 : isInProgress ? 10 : 8}
                pathOptions={{
                  color: cat.color,
                  fillColor: cat.color,
                  fillOpacity: isSelected ? 0.9 : isInProgress ? 0.8 : 0.6,
                  weight: isSelected ? 3 : 2,
                }}
                eventHandlers={{
                  click: () => onSelectProject(project),
                }}
              >
                <Popup>
                  <div className="font-body text-sm">
                    <p className="text-[10px] uppercase tracking-wide text-forest-400">
                      Project
                    </p>
                    <p className="font-bold text-forest-800">{project.title}</p>
                    <p className="text-forest-600 text-xs mt-1">
                      {cat.icon} {cat.label}
                    </p>
                    {project.location_name && (
                      <p className="text-forest-500 text-xs mt-0.5">
                        {project.location_name}
                      </p>
                    )}
                  </div>
                </Popup>
              </CircleMarker>
            );
          })}
      </MapContainer>
    </div>
  );
}

function LayerToggle({
  label,
  swatch,
  checked,
  onChange,
}: {
  label: string;
  swatch: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label className="flex items-center gap-2 px-1 py-0.5 text-xs font-body text-forest-700 cursor-pointer select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="rounded border-cream-300 text-forest-700 focus:ring-forest-500/30"
      />
      <span
        className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
        style={{ backgroundColor: swatch }}
        aria-hidden="true"
      />
      {label}
    </label>
  );
}
