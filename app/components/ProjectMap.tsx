"use client";

import { useEffect, useState } from "react";
import { CATEGORIES } from "@/lib/categories";
import type { Project } from "@/lib/types";

// Leaflet imports are dynamic to avoid SSR issues
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

// Lafayette, CA center
const LAFAYETTE_CENTER: [number, number] = [37.8935, -122.1178];
const DEFAULT_ZOOM = 14;

interface ProjectMapProps {
  projects: Project[];
  onSelectProject: (project: Project) => void;
  selectedProjectId?: number | null;
}

export default function ProjectMap({
  projects,
  onSelectProject,
  selectedProjectId,
}: ProjectMapProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="w-full h-full bg-cream-100 flex items-center justify-center rounded-lg">
        <p className="text-forest-400 font-body">Loading map...</p>
      </div>
    );
  }

  return (
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
      {projects
        .filter((p) => p.latitude && p.longitude)
        .map((project) => {
          const cat = CATEGORIES[project.category];
          const isSelected = project.id === selectedProjectId;
          const isInProgress = project.status === "in_progress";

          return (
            <CircleMarker
              key={project.id}
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
  );
}
