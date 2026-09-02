"use client";

import { useCallback, useEffect, useState } from "react";
import Header from "./components/Header";
import CategoryFilter from "./components/CategoryFilter";
import StatusFilter from "./components/StatusFilter";
import SearchBar from "./components/SearchBar";
import ProjectMap from "./components/ProjectMap";
import GroupedProjectList from "./components/GroupedProjectList";
import ProjectDetail from "./components/ProjectDetail";
import AgendaFeed from "./components/AgendaFeed";
import AgendaCalendar from "./components/AgendaCalendar";
import PulseTile, { type TileId } from "./components/PulseTile";
import OrganizationExplorer from "./components/OrganizationExplorer";
import PeopleExplorer from "./components/PeopleExplorer";
import InvolvementBoard from "./components/InvolvementBoard";
import MeasuresPlaceholder from "./components/MeasuresPlaceholder";
import { CATEGORIES, migrateCategory, type ProjectCategory, type ProjectStatus } from "@/lib/categories";
import { formatFreshness } from "@/lib/freshness";
import type { HealthResponse, Project } from "@/lib/types";

function countLabel(n: number | null | undefined, noun: string, unavailable?: boolean): string {
  if (unavailable) return "Temporarily unavailable";
  if (n == null) return "—";
  if (n === 1) return `1 ${noun}`;
  return `${n} ${noun}`;
}

export default function Home() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthLoading, setHealthLoading] = useState(true);
  const [activeCategories, setActiveCategories] = useState<Set<ProjectCategory>>(
    new Set()
  );
  const [activeStatus, setActiveStatus] = useState<ProjectStatus | null>(null);
  const [search, setSearch] = useState("");
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [expanded, setExpanded] = useState<Set<TileId>>(new Set<TileId>(["projects"]));
  const [error, setError] = useState<string | null>(null);

  const toggleTile = useCallback((id: TileId, scroll = false) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      const willExpand = !next.has(id);
      if (willExpand) next.add(id);
      else next.delete(id);
      if (willExpand && scroll) {
        requestAnimationFrame(() => {
          document.getElementById(`tile-${id}`)?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
        });
      }
      return next;
    });
  }, []);

  useEffect(() => {
    setHealthLoading(true);
    fetch("/api/health")
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (data && typeof data === "object") {
          setHealth(data as HealthResponse);
        } else {
          setHealth(null);
        }
      })
      .catch(() => setHealth(null))
      .finally(() => setHealthLoading(false));
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();
    if (activeCategories.size > 0) {
      params.set("category", Array.from(activeCategories).join(","));
    }
    if (activeStatus) {
      params.set("status", activeStatus);
    }
    if (search) {
      params.set("search", search);
    }

    const queryString = params.toString();
    const url = `/api/projects${queryString ? `?${queryString}` : ""}`;

    setLoading(true);
    setError(null);
    fetch(url)
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          const message =
            data && typeof data === "object" && "error" in data && data.error
              ? String(data.error)
              : `HTTP ${res.status} from /api/projects`;
          throw new Error(message);
        }
        return data;
      })
      .then((data) => {
        if (Array.isArray(data)) {
          const migrated = data.map((p: Project) => ({
            ...p,
            category: migrateCategory(p.category),
          }));
          setProjects(migrated);
        } else {
          setError(data?.error || "API returned unexpected data");
        }
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [activeCategories, activeStatus, search]);

  const toggleCategory = useCallback((category: ProjectCategory) => {
    setActiveCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  }, []);

  const categoryCounts = (
    Object.keys(CATEGORIES) as ProjectCategory[]
  ).reduce(
    (acc, key) => {
      acc[key] = projects.filter((p) => p.category === key).length;
      return acc;
    },
    {} as Record<ProjectCategory, number>
  );

  const freshness = formatFreshness(health, healthLoading);
  const backendDown =
    Boolean(error) ||
    (health !== null && health.supabase_reachable === false);
  const mappedCount = projects.filter((p) => p.latitude && p.longitude).length;
  const agendaCount = health?.counts.agenda_items ?? null;
  const peopleCount = health?.counts.people ?? null;
  const orgCount = health?.counts.organizations ?? null;
  const membershipCount = health?.counts.memberships ?? null;
  const seatHolderCount = health?.counts.seat_holders ?? null;
  const civicCountsDown = freshness.unavailable;

  return (
    <div className="min-h-screen flex flex-col bg-cream-50">
      <Header
        showMap={expanded.has("map")}
        onToggleMap={() => toggleTile("map", true)}
        showCalendar={expanded.has("calendar")}
        onToggleCalendar={() => toggleTile("calendar", true)}
        freshnessLabel={freshness.label}
        dataUnavailable={freshness.unavailable}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-4">
        {backendDown && (
          <div
            role="alert"
            className="bg-amber-50 border border-amber-300 text-forest-900 px-4 py-4 rounded-xl shadow-sm"
          >
            <p className="font-heading font-semibold text-base">
              Backend data is currently unavailable
            </p>
            <p className="text-sm font-body mt-1 leading-relaxed">
              The Pulse Board shell is up, but civic data could not be loaded
              from the database. This is usually a backend configuration issue
              (missing or expired Supabase credentials), not a problem with
              this page.
            </p>
            {error && (
              <p className="text-xs font-body text-forest-600 mt-2">
                {error}
              </p>
            )}
            <p className="text-sm font-body mt-3">
              <a
                href="/api/health"
                className="underline font-medium hover:text-forest-700"
              >
                Check /api/health
              </a>
              <span className="mx-1.5 text-forest-400">·</span>
              Data temporarily unavailable
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          <PulseTile
            id="projects"
            title="Projects"
            icon="📋"
            summary={countLabel(
              health?.counts.projects ?? (error ? null : projects.length),
              "active projects",
              Boolean(error)
            )}
            expanded={expanded.has("projects")}
            onToggle={() => toggleTile("projects")}
          >
            <div className="space-y-4">
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="flex-1">
                    <SearchBar value={search} onChange={setSearch} />
                  </div>
                  <StatusFilter
                    activeStatus={activeStatus}
                    onSelect={setActiveStatus}
                  />
                </div>
                <CategoryFilter
                  activeCategories={activeCategories}
                  onToggle={toggleCategory}
                  counts={categoryCounts}
                />
              </div>

              {selectedProject && (
                <div className="max-w-3xl">
                  <ProjectDetail
                    projectId={selectedProject.id}
                    onClose={() => setSelectedProject(null)}
                  />
                </div>
              )}

              {loading ? (
                <div className="space-y-4 animate-pulse">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="bg-cream-100 rounded-lg p-4 h-16" />
                  ))}
                </div>
              ) : error ? (
                <p className="text-sm font-body text-forest-500">
                  Project list unavailable until the backend recovers.
                </p>
              ) : (
                <GroupedProjectList
                  projects={projects}
                  onSelectProject={setSelectedProject}
                  selectedProjectId={selectedProject?.id}
                  activeCategories={activeCategories}
                />
              )}
            </div>
          </PulseTile>

          <PulseTile
            id="map"
            title="Map"
            icon="🗺️"
            summary={
              error
                ? "Temporarily unavailable"
                : `${mappedCount} mapped of ${projects.length} projects`
            }
            expanded={expanded.has("map")}
            onToggle={() => toggleTile("map")}
          >
            <div className="rounded-xl overflow-hidden border border-cream-200 h-[50vh] sm:h-[55vh]">
              <ProjectMap
                projects={projects}
                onSelectProject={(p) => {
                  setSelectedProject(p);
                  if (!expanded.has("projects")) toggleTile("projects");
                }}
                selectedProjectId={selectedProject?.id}
              />
            </div>
          </PulseTile>

          <PulseTile
            id="calendar"
            title="Calendar & Agenda"
            icon="📅"
            summary={countLabel(agendaCount, "agenda items", freshness.unavailable)}
            expanded={expanded.has("calendar")}
            onToggle={() => toggleTile("calendar")}
          >
            <div className="space-y-4">
              <AgendaCalendar activeCategories={activeCategories} />
              <AgendaFeed activeCategories={activeCategories} />
            </div>
          </PulseTile>

          <PulseTile
            id="organizations"
            title="Organizations"
            icon="🏛️"
            summary={countLabel(orgCount, "organizations", civicCountsDown)}
            expanded={expanded.has("organizations")}
            onToggle={() => toggleTile("organizations")}
          >
            <OrganizationExplorer
              count={orgCount}
              unavailable={civicCountsDown}
            />
          </PulseTile>

          <PulseTile
            id="people"
            title="Who's Who"
            icon="👥"
            summary={countLabel(peopleCount, "people", civicCountsDown)}
            expanded={expanded.has("people")}
            onToggle={() => toggleTile("people")}
          >
            <PeopleExplorer
              count={peopleCount}
              unavailable={civicCountsDown}
            />
          </PulseTile>

          <PulseTile
            id="involvement"
            title="Most involved"
            icon="🔗"
            summary={
              civicCountsDown
                ? "Temporarily unavailable"
                : membershipCount == null && seatHolderCount == null
                  ? "—"
                  : (membershipCount ?? 0) + (seatHolderCount ?? 0) === 0
                    ? "No board links yet"
                    : "Board footprint ranking"
            }
            expanded={expanded.has("involvement")}
            onToggle={() => toggleTile("involvement")}
          >
            <InvolvementBoard
              memberships={membershipCount}
              seatHolders={seatHolderCount}
              unavailable={civicCountsDown}
            />
          </PulseTile>

          <PulseTile
            id="measures"
            title="Measures"
            icon="🗳️"
            summary="Coming soon"
            expanded={expanded.has("measures")}
            onToggle={() => toggleTile("measures")}
          >
            <MeasuresPlaceholder />
          </PulseTile>
        </div>
      </main>

      <footer className="bg-forest-800 text-cream-200 py-4 text-center text-xs font-body">
        <p>
          Lafayette Pulse &middot; Community Project Tracker &middot; Data
          sourced from City of Lafayette public notifications
        </p>
      </footer>
    </div>
  );
}
