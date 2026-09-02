"use client";

import { useCallback, useEffect, useState } from "react";
import CategoryFilter from "../components/CategoryFilter";
import GroupedProjectList from "../components/GroupedProjectList";
import ProjectDetail from "../components/ProjectDetail";
import SearchBar from "../components/SearchBar";
import StatusFilter from "../components/StatusFilter";
import BackendBanner from "../components/BackendBanner";
import { CATEGORIES, migrateCategory, type ProjectCategory, type ProjectStatus } from "@/lib/categories";
import { useHealth } from "@/lib/use-health";
import type { Project } from "@/lib/types";

export default function ProjectsArchive({
  initialId,
}: {
  initialId?: number;
}) {
  const { health, freshness, backendDown } = useHealth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [activeStatus, setActiveStatus] = useState<ProjectStatus | null>(null);
  const [activeCategories, setActiveCategories] = useState<Set<ProjectCategory>>(
    new Set()
  );
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);

  useEffect(() => {
    const params = new URLSearchParams();
    if (activeCategories.size > 0) {
      params.set("category", Array.from(activeCategories).join(","));
    }
    if (activeStatus) params.set("status", activeStatus);
    if (search) params.set("search", search);
    const queryString = params.toString();
    setLoading(true);
    setError(null);
    fetch(`/api/projects${queryString ? `?${queryString}` : ""}`)
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(
            data && typeof data === "object" && "error" in data && data.error
              ? String(data.error)
              : `HTTP ${res.status} from /api/projects`
          );
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
          if (initialId) {
            const match = migrated.find((p) => p.id === initialId) ?? null;
            setSelectedProject(match);
          }
        } else {
          setError(data?.error || "API returned unexpected data");
        }
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [activeCategories, activeStatus, search, initialId]);

  const toggleCategory = useCallback((category: ProjectCategory) => {
    setActiveCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }, []);

  const categoryCounts = (Object.keys(CATEGORIES) as ProjectCategory[]).reduce(
    (acc, key) => {
      acc[key] = projects.filter((p) => p.category === key).length;
      return acc;
    },
    {} as Record<ProjectCategory, number>
  );

  return (
    <div className="max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-4">
      <div>
        <p className="text-[11px] uppercase tracking-wide font-body text-forest-500">
          More · archive
        </p>
        <h1 className="font-heading text-2xl font-bold text-forest-800">
          Project archive
        </h1>
        <p className="text-sm font-body text-forest-600 mt-1">
          Secondary to map, calendar, and who.{" "}
          {health?.counts.projects != null
            ? `${health.counts.projects} records.`
            : freshness.unavailable
              ? "Temporarily unavailable."
              : ""}
        </p>
      </div>

      {(backendDown || error) && <BackendBanner error={error} />}

      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <SearchBar value={search} onChange={setSearch} />
          </div>
          <StatusFilter activeStatus={activeStatus} onSelect={setActiveStatus} />
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
  );
}
