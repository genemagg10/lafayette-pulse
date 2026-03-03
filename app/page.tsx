"use client";

import { useCallback, useEffect, useState } from "react";
import Header from "./components/Header";
import CategoryFilter from "./components/CategoryFilter";
import StatusFilter from "./components/StatusFilter";
import SearchBar from "./components/SearchBar";
import ProjectMap from "./components/ProjectMap";
import ProjectList from "./components/ProjectList";
import ProjectDetail from "./components/ProjectDetail";
import AgendaFeed from "./components/AgendaFeed";
import { CATEGORIES, type ProjectCategory, type ProjectStatus } from "@/lib/categories";
import type { Project } from "@/lib/types";

type Tab = "map" | "list" | "agenda";

export default function Home() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategories, setActiveCategories] = useState<Set<ProjectCategory>>(
    new Set()
  );
  const [activeStatus, setActiveStatus] = useState<ProjectStatus | null>(null);
  const [search, setSearch] = useState("");
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("map");

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
    fetch(url)
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setProjects(data);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
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
    <div className="min-h-screen flex flex-col">
      <Header activeProjectCount={projects.length} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-4">
        {/* Filters row */}
        <div className="space-y-3">
          <CategoryFilter
            activeCategories={activeCategories}
            onToggle={toggleCategory}
            counts={categoryCounts}
          />
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <SearchBar value={search} onChange={setSearch} />
            </div>
            <StatusFilter
              activeStatus={activeStatus}
              onSelect={setActiveStatus}
            />
          </div>
        </div>

        {/* Mobile tab selector */}
        <div className="flex sm:hidden gap-1 bg-cream-200 rounded-lg p-1">
          {(["map", "list", "agenda"] as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-1.5 text-sm font-body rounded-md transition-colors capitalize ${
                activeTab === tab
                  ? "bg-white text-forest-800 shadow-sm"
                  : "text-forest-500"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Desktop: two-column layout */}
        <div className="hidden sm:grid sm:grid-cols-5 gap-4" style={{ minHeight: "65vh" }}>
          {/* Map */}
          <div className="col-span-3">
            <div className="h-full min-h-[500px]">
              <ProjectMap
                projects={projects}
                onSelectProject={setSelectedProject}
                selectedProjectId={selectedProject?.id}
              />
            </div>
          </div>

          {/* Sidebar: Detail or List + Agenda */}
          <div className="col-span-2 space-y-4 overflow-y-auto max-h-[75vh]">
            {selectedProject && (
              <ProjectDetail
                projectId={selectedProject.id}
                onClose={() => setSelectedProject(null)}
              />
            )}

            <div>
              <h2 className="font-heading font-semibold text-forest-800 text-lg mb-3">
                Projects ({projects.length})
              </h2>
              {loading ? (
                <div className="space-y-3 animate-pulse">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="bg-white rounded-lg p-4 h-20" />
                  ))}
                </div>
              ) : (
                <ProjectList
                  projects={projects}
                  onSelectProject={setSelectedProject}
                  selectedProjectId={selectedProject?.id}
                />
              )}
            </div>

            <div>
              <h2 className="font-heading font-semibold text-forest-800 text-lg mb-3">
                Agenda Feed
              </h2>
              <AgendaFeed activeCategories={activeCategories} />
            </div>
          </div>
        </div>

        {/* Mobile: tabbed views */}
        <div className="sm:hidden">
          {activeTab === "map" && (
            <div className="h-[60vh]">
              <ProjectMap
                projects={projects}
                onSelectProject={(p) => {
                  setSelectedProject(p);
                  setActiveTab("list");
                }}
                selectedProjectId={selectedProject?.id}
              />
            </div>
          )}

          {activeTab === "list" && (
            <div className="space-y-4">
              {selectedProject && (
                <ProjectDetail
                  projectId={selectedProject.id}
                  onClose={() => setSelectedProject(null)}
                />
              )}
              {loading ? (
                <div className="space-y-3 animate-pulse">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="bg-white rounded-lg p-4 h-20" />
                  ))}
                </div>
              ) : (
                <ProjectList
                  projects={projects}
                  onSelectProject={setSelectedProject}
                  selectedProjectId={selectedProject?.id}
                />
              )}
            </div>
          )}

          {activeTab === "agenda" && (
            <AgendaFeed activeCategories={activeCategories} />
          )}
        </div>
      </main>

      <footer className="bg-forest-800 text-cream-200 py-4 text-center text-xs font-body">
        <p>
          Vibrant Lafayette &middot; Community Project Tracker &middot; Data
          sourced from City of Lafayette public agendas
        </p>
      </footer>
    </div>
  );
}
