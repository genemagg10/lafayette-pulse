"use client";

import { useState } from "react";
import { CATEGORIES, STATUS_STYLES } from "@/lib/categories";
import type { Project } from "@/lib/types";

interface ProjectListProps {
  projects: Project[];
  onSelectProject: (project: Project) => void;
  selectedProjectId?: number | null;
}

type SortKey = "updated_at" | "status" | "category";

export default function ProjectList({
  projects,
  onSelectProject,
  selectedProjectId,
}: ProjectListProps) {
  const [sortBy, setSortBy] = useState<SortKey>("updated_at");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const sorted = [...projects].sort((a, b) => {
    if (sortBy === "updated_at") {
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    }
    if (sortBy === "category") {
      return a.category.localeCompare(b.category);
    }
    if (sortBy === "status") {
      return a.status.localeCompare(b.status);
    }
    return 0;
  });

  return (
    <div className="space-y-3">
      {/* Sort controls */}
      <div className="flex items-center gap-2 text-xs font-body text-forest-600">
        <span>Sort by:</span>
        {(["updated_at", "category", "status"] as SortKey[]).map((key) => (
          <button
            key={key}
            onClick={() => setSortBy(key)}
            className={`px-2 py-0.5 rounded transition-colors ${
              sortBy === key
                ? "bg-forest-800 text-cream-50"
                : "bg-line text-forest-600 hover:bg-line-strong"
            }`}
          >
            {key === "updated_at" ? "Date" : key === "category" ? "Category" : "Status"}
          </button>
        ))}
      </div>

      {/* Project cards */}
      {sorted.length === 0 ? (
        <div className="text-center py-12 text-forest-400 font-body">
          <p>No projects match your filters.</p>
        </div>
      ) : (
        sorted.map((project) => {
          const cat = CATEGORIES[project.category];
          const statusStyle = STATUS_STYLES[project.status];
          const isExpanded = expandedId === project.id;
          const isSelected = project.id === selectedProjectId;

          return (
            <div
              key={project.id}
              className={`bg-surface rounded-lg border transition-all cursor-pointer ${
                isSelected ? "ring-2 ring-forest-500" : "border-line"
              }`}
              onClick={() => {
                onSelectProject(project);
                setExpandedId(isExpanded ? null : project.id);
              }}
            >
              <div className="flex">
                {/* Category color bar */}
                <div
                  className="w-1.5 rounded-l-lg flex-shrink-0"
                  style={{ backgroundColor: cat.color }}
                />

                <div className="flex-1 p-3 sm:p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2 min-w-0">
                      <span className="text-lg flex-shrink-0" aria-hidden="true">
                        {cat.icon}
                      </span>
                      <div className="min-w-0">
                        <h3 className="font-heading font-semibold text-ink text-sm sm:text-base leading-tight">
                          {project.title}
                        </h3>
                        {project.location_name && (
                          <p className="text-ink-muted text-xs mt-0.5 font-body truncate">
                            {project.location_name}
                          </p>
                        )}
                      </div>
                    </div>
                    <span
                      className="text-xs font-body px-2 py-0.5 rounded-full flex-shrink-0"
                      style={{
                        backgroundColor: statusStyle.bg,
                        color: statusStyle.color,
                      }}
                    >
                      {statusStyle.label}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 mt-2 text-xs text-forest-400 font-body">
                    <span>{cat.label}</span>
                    <span>
                      Updated{" "}
                      {new Date(project.updated_at).toLocaleDateString()}
                    </span>
                  </div>

                  {/* Expanded content */}
                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t border-line space-y-2 text-sm font-body">
                      {project.description && (
                        <p className="text-forest-700">{project.description}</p>
                      )}
                      {project.timeline_text && (
                        <p className="text-ink-muted">
                          <span className="font-medium text-forest-700">
                            Timeline:
                          </span>{" "}
                          {project.timeline_text}
                        </p>
                      )}
                      {project.funding_source && (
                        <p className="text-ink-muted">
                          <span className="font-medium text-forest-700">
                            Funding:
                          </span>{" "}
                          {project.funding_source}
                        </p>
                      )}
                      {project.estimated_cost && (
                        <p className="text-ink-muted">
                          <span className="font-medium text-forest-700">
                            Est. Cost:
                          </span>{" "}
                          ${project.estimated_cost.toLocaleString()}
                        </p>
                      )}
                      {project.source_url && project.source_url.startsWith("http") && (
                        <a
                          href={project.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-forest-600 underline hover:text-ink"
                          onClick={(e) => e.stopPropagation()}
                        >
                          View Source
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        </a>
                      )}
                      {project.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {project.tags.map((tag) => (
                            <span
                              key={tag}
                              className="bg-line text-forest-600 text-xs px-2 py-0.5 rounded-full"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
