"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import ProjectMap, {
  DEFAULT_MAP_LAYERS,
  type MapLayerId,
  type MapLayers,
} from "./ProjectMap";
import FocusFrame from "./FocusFrame";
import { CATEGORIES, migrateCategory } from "@/lib/categories";
import { ORG_TYPE_LABELS, type CivicEvent, type Organization, type Project } from "@/lib/types";

type Selection =
  | { kind: "event"; item: CivicEvent }
  | { kind: "organization"; item: Organization }
  | { kind: "project"; item: Project };

export default function MapWorkspace() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [layers, setLayers] = useState<MapLayers>(DEFAULT_MAP_LAYERS);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [panelOpen, setPanelOpen] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    fetch("/api/projects")
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error();
        return Array.isArray(data) ? data : [];
      })
      .then((rows: Project[]) =>
        setProjects(rows.map((p) => ({ ...p, category: migrateCategory(p.category) })))
      )
      .catch(() => setProjects([]));
  }, []);

  const toggleLayer = useCallback((id: MapLayerId) => {
    setLayers((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const select = (next: Selection) => {
    setSelection(next);
    setPanelOpen(true);
    setSheetOpen(true);
  };

  return (
    <FocusFrame>
      <div className="relative h-full min-h-0">
        <div
          className={`h-full min-h-0 ${
            panelOpen ? "md:pr-[min(38%,400px)]" : ""
          }`}
        >
          <ProjectMap
            projects={projects}
            layers={layers}
            onToggleLayer={toggleLayer}
            onSelectProject={(item) => select({ kind: "project", item })}
            onSelectEvent={(item) => select({ kind: "event", item })}
            onSelectOrganization={(item) => select({ kind: "organization", item })}
            selectedProjectId={selection?.kind === "project" ? selection.item.id : null}
            selectedEventId={selection?.kind === "event" ? selection.item.id : null}
            selectedOrgId={selection?.kind === "organization" ? selection.item.id : null}
          />
        </div>

        <aside
          className={`hidden md:flex flex-col absolute top-0 right-0 h-full w-[min(38%,400px)] min-w-[320px] bg-white border-l border-cream-200 shadow-sm transition-transform ${
            panelOpen ? "translate-x-0" : "translate-x-full"
          }`}
        >
          <PanelHeader
            onToggle={() => setPanelOpen(false)}
            toggleLabel="Collapse panel"
          />
          <div className="flex-1 min-h-0 overflow-y-auto p-4">
            <SelectionBody selection={selection} />
          </div>
        </aside>

        {!panelOpen && (
          <button
            type="button"
            onClick={() => setPanelOpen(true)}
            className="hidden md:block absolute top-3 right-3 z-[1000] rounded-lg bg-white border border-cream-200 shadow-sm px-3 py-1.5 text-xs font-body text-forest-700"
          >
            Selection
          </button>
        )}

        {sheetOpen && (
          <div className="md:hidden absolute inset-x-0 bottom-0 z-[1100] max-h-[55%] rounded-t-2xl bg-white border-t border-cream-200 shadow-2xl flex flex-col">
            <button
              type="button"
              className="flex-shrink-0 py-2 flex justify-center"
              onClick={() => setSheetOpen(false)}
              aria-label="Close selection sheet"
            >
              <span className="w-10 h-1 rounded-full bg-cream-300" />
            </button>
            <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4">
              <SelectionBody selection={selection} />
            </div>
          </div>
        )}
      </div>
    </FocusFrame>
  );
}

function PanelHeader({
  onToggle,
  toggleLabel,
}: {
  onToggle: () => void;
  toggleLabel: string;
}) {
  return (
    <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-cream-200">
      <h2 className="font-heading font-semibold text-forest-800">Selection</h2>
      <button
        type="button"
        onClick={onToggle}
        className="text-xs font-body text-forest-500 hover:text-forest-800"
      >
        {toggleLabel}
      </button>
    </div>
  );
}

function SelectionBody({ selection }: { selection: Selection | null }) {
  if (!selection) {
    return (
      <p className="text-sm font-body text-forest-500">
        Tap a marker. Layers: Events and Organizations on; Projects off unless
        you turn them on.
      </p>
    );
  }

  if (selection.kind === "event") {
    const event = selection.item;
    return (
      <div className="space-y-2">
        <p className="text-[11px] uppercase tracking-wide text-forest-400 font-body">
          Event
        </p>
        <h3 className="font-heading font-semibold text-forest-800">{event.title}</h3>
        {event.starts_at && (
          <p className="text-sm font-body text-forest-600">
            {new Date(event.starts_at).toLocaleDateString("en-US", {
              weekday: "short",
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </p>
        )}
        {event.location_name && (
          <p className="text-sm font-body text-forest-500">{event.location_name}</p>
        )}
        {event.description && (
          <p className="text-sm font-body text-forest-600 leading-relaxed">
            {event.description}
          </p>
        )}
        <Link href="/calendar" className="text-xs underline text-forest-600">
          Open calendar
        </Link>
      </div>
    );
  }

  if (selection.kind === "organization") {
    const org = selection.item;
    return (
      <div className="space-y-2">
        <p className="text-[11px] uppercase tracking-wide text-forest-400 font-body">
          Organization
        </p>
        <h3 className="font-heading font-semibold text-forest-800">{org.name}</h3>
        <p className="text-sm font-body text-forest-600">
          {ORG_TYPE_LABELS[org.org_type] ?? org.org_type}
        </p>
        {org.location_name && (
          <p className="text-sm font-body text-forest-500">{org.location_name}</p>
        )}
        <Link
          href="/who?tab=orgs"
          className="text-xs underline text-forest-600"
        >
          Open in Who
        </Link>
      </div>
    );
  }

  const project = selection.item;
  const cat = CATEGORIES[project.category];
  return (
    <div className="space-y-2">
      <p className="text-[11px] uppercase tracking-wide text-forest-400 font-body">
        Project
      </p>
      <h3 className="font-heading font-semibold text-forest-800">{project.title}</h3>
      <p className="text-sm font-body text-forest-600">
        {cat.icon} {cat.label}
      </p>
      {project.location_name && (
        <p className="text-sm font-body text-forest-500">{project.location_name}</p>
      )}
      {project.description && (
        <p className="text-sm font-body text-forest-600 leading-relaxed line-clamp-6">
          {project.description}
        </p>
      )}
      <Link
        href={`/projects/${project.id}`}
        className="text-xs underline text-forest-600"
      >
        Open project archive
      </Link>
    </div>
  );
}
