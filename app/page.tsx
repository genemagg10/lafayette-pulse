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
import { CATEGORIES, migrateCategory, type ProjectCategory, type ProjectStatus } from "@/lib/categories";
import type { Project } from "@/lib/types";

type ContentTab = "projects" | "agenda";

export default function Home() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategories, setActiveCategories] = useState<Set<ProjectCategory>>(
    new Set()
  );
  const [activeStatus, setActiveStatus] = useState<ProjectStatus | null>(null);
  const [search, setSearch] = useState("");
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [showMap, setShowMap] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [contentTab, setContentTab] = useState<ContentTab>("projects");

  const [error, setError] = useState<string | null>(null);

  // Fetch projects when filters change
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
      .then((res) => {
        if (!res.ok) throw new Error(`API error: ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (Array.isArray(data)) {
          // Remap legacy category values (bike_ped → transportation, etc.)
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

  // Count projects per category
  const categoryCounts = (
    Object.keys(CATEGORIES) as ProjectCategory[]
  ).reduce(
    (acc, key) => {
      acc[key] = projects.filter((p) => p.category === key).length;
      return acc;
    },
    {} as Record<ProjectCategory, number>
  );

  return (
    <div className="min-h-screen flex flex-col bg-cream-50">
      <Header
        showMap={showMap}
        onToggleMap={() => setShowMap((v) => !v)}
        showCalendar={showCalendar}
        onToggleCalendar={() => setShowCalendar((v) => !v)}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-4">
        {/* Filters row */}
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

        {/* Optional map panel */}
        {showMap && (
          <div className="rounded-xl overflow-hidden shadow-md border border-cream-200">
            <div className="h-[50vh] sm:h-[55vh]">
              <ProjectMap
                projects={projects}
                onSelectProject={(p) => {
                  setSelectedProject(p);
                  setContentTab("projects");
                }}
                selectedProjectId={selectedProject?.id}
              />
            </div>
          </div>
        )}

        {/* Optional calendar panel */}
        {showCalendar && (
          <AgendaCalendar activeCategories={activeCategories} />
        )}

        {/* Content tabs */}
        <div className="flex items-center gap-1 border-b border-cream-200">
          {(["projects", "agenda"] as ContentTab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setContentTab(tab)}
              className={`px-4 py-2 text-sm font-body font-medium border-b-2 transition-colors ${
                contentTab === tab
                  ? "border-forest-700 text-forest-800"
                  : "border-transparent text-forest-400 hover:text-forest-600 hover:border-cream-300"
              }`}
            >
              {tab === "projects" ? `Projects (${projects.length})` : "Agenda Feed"}
            </button>
          ))}
        </div>

        {/* Project detail (if selected) */}
        {selectedProject && contentTab === "projects" && (
          <div className="max-w-3xl">
            <ProjectDetail
              projectId={selectedProject.id}
              onClose={() => setSelectedProject(null)}
            />
          </div>
        )}

        {/* Error banner */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm font-body">
            Failed to load projects: {error}
          </div>
        )}

        {/* Main content */}
        {contentTab === "projects" && (
          <div>
            {loading ? (
              <div className="space-y-4 animate-pulse">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="bg-white rounded-lg p-4 h-16" />
                ))}
              </div>
            ) : (
              <GroupedProjectList
                projects={projects}
                onSelectProject={setSelectedProject}
                selectedProjectId={selectedProject?.id}
                activeCategories={activeCategories}
              />
            )}
          </div>
        )}

        {contentTab === "agenda" && (
          <AgendaFeed activeCategories={activeCategories} />
        )}
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
