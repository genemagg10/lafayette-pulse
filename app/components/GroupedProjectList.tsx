"use client";

import { useMemo, useState } from "react";
import { CATEGORIES, STATUS_STYLES } from "@/lib/categories";
import type { ProjectCategory } from "@/lib/categories";
import type { Project } from "@/lib/types";

interface GroupedProjectListProps {
  projects: Project[];
  onSelectProject: (project: Project) => void;
  selectedProjectId?: number | null;
  activeCategories: Set<ProjectCategory>;
}

interface LocationGroup {
  location: string;
  projects: Project[];
}

function normalizeLocation(loc: string | null): string {
  if (!loc) return "";
  return loc.toLowerCase().replace(/[,.\-\/\\]+/g, " ").replace(/\s+/g, " ").trim();
}

function groupByLocation(projects: Project[]): LocationGroup[] {
  const map = new Map<string, Project[]>();
  const order: string[] = [];

  for (const p of projects) {
    const key = normalizeLocation(p.location_name) || `__solo_${p.id}`;
    if (!map.has(key)) {
      map.set(key, []);
      order.push(key);
    }
    map.get(key)!.push(p);
  }

  // Sort: multi-project groups first, then singles by date
  const groups: LocationGroup[] = order.map((key) => ({
    location: key.startsWith("__solo_") ? "" : map.get(key)![0].location_name || "",
    projects: map.get(key)!.sort(
      (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    ),
  }));

  groups.sort((a, b) => {
    // Multi-project groups bubble up
    if (a.projects.length > 1 && b.projects.length <= 1) return -1;
    if (b.projects.length > 1 && a.projects.length <= 1) return 1;
    // Then by most recent update
    return (
      new Date(b.projects[0].updated_at).getTime() -
      new Date(a.projects[0].updated_at).getTime()
    );
  });

  return groups;
}

function ProjectCard({
  project,
  onSelect,
  isSelected,
  nested,
}: {
  project: Project;
  onSelect: () => void;
  isSelected: boolean;
  nested?: boolean;
}) {
  const cat = CATEGORIES[project.category];
  const statusStyle = STATUS_STYLES[project.status];
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={`bg-white rounded-lg shadow-sm border transition-all cursor-pointer hover:shadow-md ${
        isSelected ? "ring-2 ring-forest-500" : "border-cream-200"
      } ${nested ? "ml-4 border-l-2" : ""}`}
      style={nested ? { borderLeftColor: cat.color } : undefined}
      onClick={() => {
        onSelect();
        setExpanded(!expanded);
      }}
    >
      <div className="flex">
        {!nested && (
          <div
            className="w-1.5 rounded-l-lg flex-shrink-0"
            style={{ backgroundColor: cat.color }}
          />
        )}
        <div className="flex-1 p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2 min-w-0">
              <span className="text-base flex-shrink-0" aria-hidden="true">
                {cat.icon}
              </span>
              <div className="min-w-0">
                <h4 className="font-heading font-semibold text-forest-800 text-sm leading-tight">
                  {project.title}
                </h4>
                {project.location_name && !nested && (
                  <p className="text-forest-500 text-xs mt-0.5 font-body truncate">
                    {project.location_name}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <span
                className="text-xs font-body px-2 py-0.5 rounded-full"
                style={{ backgroundColor: statusStyle.bg, color: statusStyle.color }}
              >
                {statusStyle.label}
              </span>
              <svg
                className={`w-4 h-4 text-forest-400 transition-transform ${expanded ? "rotate-180" : ""}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>

          <div className="flex items-center gap-3 mt-1.5 text-xs text-forest-400 font-body">
            <span>
              Updated {new Date(project.updated_at).toLocaleDateString()}
            </span>
            {project.tags.length > 0 && (
              <div className="flex gap-1 flex-wrap">
                {project.tags.slice(0, 3).map((tag) => (
                  <span
                    key={tag}
                    className="bg-cream-100 text-forest-500 px-1.5 py-0.5 rounded-full"
                  >
                    {tag}
                  </span>
                ))}
                {project.tags.length > 3 && (
                  <span className="text-forest-400">+{project.tags.length - 3}</span>
                )}
              </div>
            )}
          </div>

          {expanded && (
            <div className="mt-3 pt-3 border-t border-cream-200 space-y-2 text-sm font-body">
              {project.description && (
                <p className="text-forest-700">{project.description}</p>
              )}
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                {project.timeline_text && (
                  <div>
                    <span className="font-medium text-forest-600">Timeline:</span>{" "}
                    <span className="text-forest-500">{project.timeline_text}</span>
                  </div>
                )}
                {project.funding_source && (
                  <div>
                    <span className="font-medium text-forest-600">Funding:</span>{" "}
                    <span className="text-forest-500">{project.funding_source}</span>
                  </div>
                )}
                {project.estimated_cost && (
                  <div>
                    <span className="font-medium text-forest-600">Est. Cost:</span>{" "}
                    <span className="text-forest-500">
                      ${project.estimated_cost.toLocaleString()}
                    </span>
                  </div>
                )}
              </div>
              {project.source_url && project.source_url.startsWith("http") && (
                <a
                  href={project.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-forest-600 underline hover:text-forest-800 text-xs"
                  onClick={(e) => e.stopPropagation()}
                >
                  View Source
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function GroupedProjectList({
  projects,
  onSelectProject,
  selectedProjectId,
  activeCategories,
}: GroupedProjectListProps) {
  const [collapsedCategories, setCollapsedCategories] = useState<Set<ProjectCategory>>(
    new Set()
  );

  const toggleCollapse = (cat: ProjectCategory) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) {
        next.delete(cat);
      } else {
        next.add(cat);
      }
      return next;
    });
  };

  // Group projects by category, maintaining a stable order
  const grouped = useMemo(() => {
    const categoryOrder: ProjectCategory[] = [
      "bike_ped",
      "safe_routes",
      "street_quieting",
      "infrastructure",
      "parks_trails",
      "city_council",
    ];

    const result: { category: ProjectCategory; locationGroups: LocationGroup[] }[] = [];

    for (const cat of categoryOrder) {
      const catProjects = projects.filter((p) => p.category === cat);
      if (catProjects.length === 0) continue;
      result.push({
        category: cat,
        locationGroups: groupByLocation(catProjects),
      });
    }

    return result;
  }, [projects]);

  if (projects.length === 0) {
    return (
      <div className="text-center py-12 text-forest-400 font-body">
        <p>No projects match your filters.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {grouped.map(({ category, locationGroups }) => {
        const cat = CATEGORIES[category];
        const isCollapsed = collapsedCategories.has(category);
        const projectCount = locationGroups.reduce(
          (sum, g) => sum + g.projects.length,
          0
        );

        return (
          <section key={category}>
            {/* Category header */}
            <button
              onClick={() => toggleCollapse(category)}
              className="w-full flex items-center gap-3 py-2 px-3 rounded-lg transition-colors hover:bg-cream-100 group"
            >
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center text-lg flex-shrink-0"
                style={{ backgroundColor: `${cat.color}20` }}
              >
                {cat.icon}
              </div>
              <div className="flex-1 text-left">
                <h3
                  className="font-heading font-bold text-sm sm:text-base"
                  style={{ color: cat.color }}
                >
                  {cat.label}
                </h3>
                <p className="text-xs text-forest-400 font-body">{cat.description}</p>
              </div>
              <span
                className="text-xs font-body font-semibold px-2 py-0.5 rounded-full"
                style={{ backgroundColor: `${cat.color}20`, color: cat.color }}
              >
                {projectCount}
              </span>
              <svg
                className={`w-5 h-5 text-forest-400 transition-transform ${isCollapsed ? "" : "rotate-180"}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {/* Projects within this category */}
            {!isCollapsed && (
              <div className="mt-2 space-y-2 pl-2">
                {locationGroups.map((group) => {
                  if (group.projects.length === 1 && !group.location) {
                    // Single project, no location — render directly
                    const p = group.projects[0];
                    return (
                      <ProjectCard
                        key={p.id}
                        project={p}
                        onSelect={() => onSelectProject(p)}
                        isSelected={p.id === selectedProjectId}
                      />
                    );
                  }

                  if (group.projects.length === 1) {
                    // Single project with location — render directly
                    const p = group.projects[0];
                    return (
                      <ProjectCard
                        key={p.id}
                        project={p}
                        onSelect={() => onSelectProject(p)}
                        isSelected={p.id === selectedProjectId}
                      />
                    );
                  }

                  // Multiple projects sharing a location — nested group
                  return (
                    <div key={group.location} className="space-y-1.5">
                      <div className="flex items-center gap-2 px-2 pt-2">
                        <svg
                          className="w-3.5 h-3.5 text-forest-400 flex-shrink-0"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                          />
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                          />
                        </svg>
                        <span className="text-xs font-body font-semibold text-forest-600 uppercase tracking-wider">
                          {group.location}
                        </span>
                        <span className="text-xs text-forest-400 font-body">
                          ({group.projects.length} projects)
                        </span>
                      </div>
                      {group.projects.map((p) => (
                        <ProjectCard
                          key={p.id}
                          project={p}
                          onSelect={() => onSelectProject(p)}
                          isSelected={p.id === selectedProjectId}
                          nested
                        />
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
