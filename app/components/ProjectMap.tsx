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
  onSelectEvent?: (event: CivicEvent) => void;
  onSelectOrganization?: (org: Organization) => void;
  selectedEventId?: string | null;
  selectedOrgId?: string | null;
  className?: string;
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
  onSelectEvent,
  onSelectOrganization,
  selectedEventId,
  selectedOrgId,
  className,
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
      <div className="w-full h-full bg-canvas flex items-center justify-center">
        <p className="text-forest-400 font-body">Loading map...</p>
      </div>
    );
  }

  return (
    <div className={`relative w-full h-full map-bleed ${className ?? ""}`}>
      <div className="absolute top-3 right-3 z-[1000] border border-line bg-surface p-2 space-y-1">
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
          events.map((event) => {
            const selected = event.id === selectedEventId;
            return (
              <CircleMarker
                key={`event-${event.id}`}
                center={[event.latitude!, event.longitude!]}
                radius={selected ? 12 : 8}
                pathOptions={{
                  color: EVENT_COLOR,
                  fillColor: EVENT_COLOR,
                  fillOpacity: selected ? 0.9 : 0.75,
                  weight: selected ? 3 : 2,
                }}
                eventHandlers={{
                  click: () => onSelectEvent?.(event),
                }}
              >
                <Popup>
                  <div className="font-body text-sm">
                    <p className="text-[10px] uppercase tracking-wide text-ink-muted">
                      Event
                    </p>
                    <p className="font-bold text-ink">{event.title}</p>
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
                      <p className="text-ink-muted text-xs mt-0.5">
                        {event.location_name}
                      </p>
                    )}
                  </div>
                </Popup>
              </CircleMarker>
            );
          })}

        {layers.organizations &&
          organizations.map((org) => {
            const selected = org.id === selectedOrgId;
            return (
              <CircleMarker
                key={`org-${org.id}`}
                center={[org.latitude!, org.longitude!]}
                radius={selected ? 12 : 8}
                pathOptions={{
                  color: ORG_COLOR,
                  fillColor: ORG_COLOR,
                  fillOpacity: selected ? 0.9 : 0.75,
                  weight: selected ? 3 : 2,
                }}
                eventHandlers={{
                  click: () => onSelectOrganization?.(org),
                }}
              >
                <Popup>
                  <div className="font-body text-sm">
                    <p className="text-[10px] uppercase tracking-wide text-ink-muted">
                      Organization
                    </p>
                    <p className="font-bold text-ink">{org.name}</p>
                    <p className="text-forest-600 text-xs mt-1">
                      {ORG_TYPE_LABELS[org.org_type] ?? org.org_type}
                    </p>
                    {org.location_name && (
                      <p className="text-ink-muted text-xs mt-0.5">
                        {org.location_name}
                      </p>
                    )}
                  </div>
                </Popup>
              </CircleMarker>
            );
          })}

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
                    <p className="text-[10px] uppercase tracking-wide text-ink-muted">
                      Project
                    </p>
                    <p className="font-bold text-ink">{project.title}</p>
                    <p className="text-forest-600 text-xs mt-1">
                      {cat.icon} {cat.label}
                    </p>
                    {project.location_name && (
                      <p className="text-ink-muted text-xs mt-0.5">
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
        className="rounded border-line-strong text-forest-700 focus:ring-forest-500/30"
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
