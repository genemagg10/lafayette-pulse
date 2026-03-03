"use client";

import { useMemo, useState } from "react";
import { CATEGORIES, SUBCATEGORIES, STATUS_STYLES } from "@/lib/categories";
import type { ProjectCategory, Subcategory } from "@/lib/categories";
import type { Project } from "@/lib/types";

interface GroupedProjectListProps {
  projects: Project[];
  onSelectProject: (project: Project) => void;
  selectedProjectId?: number | null;
  activeCategories: Set<ProjectCategory>;
}

// ─── Helpers ────────────────────────────────────────────────────────

/** Build a lookup: subcategory key → label for a given category. */
function subLookup(category: ProjectCategory): Map<string, string> {
  const m = new Map<string, string>();
  for (const s of SUBCATEGORIES[category]) {
    m.set(s.key, s.label);
  }
  return m;
}

/** Return the first tag that matches a known subcategory, or "". */
function getSubcategoryKey(project: Project, subs: Map<string, string>): string {
  for (const tag of project.tags) {
    if (subs.has(tag)) return tag;
  }
  return "";
}

interface SubcategoryGroup {
  key: string;
  label: string;
  projects: Project[];
}

function groupBySubcategory(
  projects: Project[],
  category: ProjectCategory,
): SubcategoryGroup[] {
  const subs = subLookup(category);
  const map = new Map<string, Project[]>();
  const order: string[] = [];

  for (const p of projects) {
    const key = getSubcategoryKey(p, subs) || "__other";
    if (!map.has(key)) {
      map.set(key, []);
      order.push(key);
    }
    map.get(key)!.push(p);
  }

  // Build groups, sorting each group's projects by updated_at desc
  const groups: SubcategoryGroup[] = order.map((key) => ({
    key,
    label: key === "__other" ? "Other" : subs.get(key) || key,
    projects: map.get(key)!.sort(
      (a, b) =>
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
    ),
  }));

  // Groups with more projects first, then by recency
  groups.sort((a, b) => {
    if (a.projects.length !== b.projects.length)
      return b.projects.length - a.projects.length;
    return (
      new Date(b.projects[0].updated_at).getTime() -
      new Date(a.projects[0].updated_at).getTime()
    );
  });

  return groups;
}

// ─── Tags display (skip the subcategory tag) ────────────────────────

function displayTags(project: Project, subs: Map<string, string>): string[] {
  return project.tags.filter((t) => !subs.has(t));
}

// ─── ProjectCard ────────────────────────────────────────────────────

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
  const subs = useMemo(() => subLookup(project.category), [project.category]);
  const visibleTags = useMemo(
    () => displayTags(project, subs),
    [project, subs],
  );

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
                {project.location_name && (
                  <p className="text-forest-500 text-xs mt-0.5 font-body truncate">
                    {project.location_name}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <span
                className="text-xs font-body px-2 py-0.5 rounded-full"
                style={{
                  backgroundColor: statusStyle.bg,
                  color: statusStyle.color,
                }}
              >
                {statusStyle.label}
              </span>
              <svg
                className={`w-4 h-4 text-forest-400 transition-transform ${expanded ? "rotate-180" : ""}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </div>
          </div>

          <div className="flex items-center gap-3 mt-1.5 text-xs text-forest-400 font-body">
            <span>
              Updated {new Date(project.updated_at).toLocaleDateString()}
            </span>
            {visibleTags.length > 0 && (
              <div className="flex gap-1 flex-wrap">
                {visibleTags.slice(0, 3).map((tag) => (
                  <span
                    key={tag}
                    className="bg-cream-100 text-forest-500 px-1.5 py-0.5 rounded-full"
                  >
                    {tag}
                  </span>
                ))}
                {visibleTags.length > 3 && (
                  <span className="text-forest-400">
                    +{visibleTags.length - 3}
                  </span>
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
                    <span className="font-medium text-forest-600">
                      Timeline:
                    </span>{" "}
                    <span className="text-forest-500">
                      {project.timeline_text}
                    </span>
                  </div>
                )}
                {project.funding_source && (
                  <div>
                    <span className="font-medium text-forest-600">
                      Funding:
                    </span>{" "}
                    <span className="text-forest-500">
                      {project.funding_source}
                    </span>
                  </div>
                )}
                {project.estimated_cost && (
                  <div>
                    <span className="font-medium text-forest-600">
                      Est. Cost:
                    </span>{" "}
                    <span className="text-forest-500">
                      ${project.estimated_cost.toLocaleString()}
                    </span>
                  </div>
                )}
              </div>
              {project.source_url &&
                project.source_url.startsWith("http") && (
                  <a
                    href={project.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-forest-600 underline hover:text-forest-800 text-xs"
                    onClick={(e) => e.stopPropagation()}
                  >
                    View Source
                    <svg
                      className="w-3 h-3"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                      />
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

// ─── Main component ─────────────────────────────────────────────────

const CATEGORY_ORDER: ProjectCategory[] = [
  "transportation",
  "government",
  "development",
  "parks_environment",
  "public_safety",
  "community",
  "jobs",
  "news",
];

export default function GroupedProjectList({
  projects,
  onSelectProject,
  selectedProjectId,
}: GroupedProjectListProps) {
  const [collapsedCategories, setCollapsedCategories] = useState<
    Set<ProjectCategory>
  >(new Set());

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

  // Group: category → subcategory → projects
  const grouped = useMemo(() => {
    const result: {
      category: ProjectCategory;
      subcategoryGroups: SubcategoryGroup[];
      totalCount: number;
    }[] = [];

    for (const cat of CATEGORY_ORDER) {
      const catProjects = projects.filter((p) => p.category === cat);
      if (catProjects.length === 0) continue;
      result.push({
        category: cat,
        subcategoryGroups: groupBySubcategory(catProjects, cat),
        totalCount: catProjects.length,
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
      {grouped.map(({ category, subcategoryGroups, totalCount }) => {
        const cat = CATEGORIES[category];
        const isCollapsed = collapsedCategories.has(category);
        const hasMultipleSubgroups =
          subcategoryGroups.length > 1 ||
          (subcategoryGroups.length === 1 &&
            subcategoryGroups[0].key !== "__other");

        return (
          <section key={category}>
            {/* ── Category header ── */}
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
                <p className="text-xs text-forest-400 font-body">
                  {cat.description}
                </p>
              </div>
              <span
                className="text-xs font-body font-semibold px-2 py-0.5 rounded-full"
                style={{
                  backgroundColor: `${cat.color}20`,
                  color: cat.color,
                }}
              >
                {totalCount}
              </span>
              <svg
                className={`w-5 h-5 text-forest-400 transition-transform ${isCollapsed ? "" : "rotate-180"}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>

            {/* ── Subcategory groups ── */}
            {!isCollapsed && (
              <div className="mt-2 space-y-3 pl-2">
                {subcategoryGroups.map((subGroup) => {
                  // If only one group with key "__other", skip subcategory header
                  if (!hasMultipleSubgroups && subGroup.key === "__other") {
                    return (
                      <div key="__other" className="space-y-2">
                        {subGroup.projects.map((p) => (
                          <ProjectCard
                            key={p.id}
                            project={p}
                            onSelect={() => onSelectProject(p)}
                            isSelected={p.id === selectedProjectId}
                          />
                        ))}
                      </div>
                    );
                  }

                  return (
                    <div key={subGroup.key} className="space-y-1.5">
                      {/* Subcategory header */}
                      <div className="flex items-center gap-2 px-2 pt-1">
                        <div
                          className="w-1 h-4 rounded-full flex-shrink-0"
                          style={{ backgroundColor: cat.color, opacity: 0.5 }}
                        />
                        <span className="text-xs font-body font-semibold text-forest-600 uppercase tracking-wider">
                          {subGroup.label}
                        </span>
                        <span className="text-xs text-forest-400 font-body">
                          ({subGroup.projects.length})
                        </span>
                      </div>
                      {subGroup.projects.map((p) => (
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
