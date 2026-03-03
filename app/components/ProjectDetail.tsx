"use client";

import { useEffect, useState } from "react";
import { CATEGORIES, STATUS_STYLES } from "@/lib/categories";
import type { Project, ProjectUpdate } from "@/lib/types";

interface ProjectWithUpdates extends Project {
  updates?: ProjectUpdate[];
}

interface ProjectDetailProps {
  projectId: number;
  onClose: () => void;
}

export default function ProjectDetail({
  projectId,
  onClose,
}: ProjectDetailProps) {
  const [project, setProject] = useState<ProjectWithUpdates | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/projects/${projectId}`)
      .then((res) => res.json())
      .then((data) => {
        setProject(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [projectId]);

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-lg p-6 animate-pulse">
        <div className="h-6 bg-cream-200 rounded w-3/4 mb-4" />
        <div className="h-4 bg-cream-200 rounded w-full mb-2" />
        <div className="h-4 bg-cream-200 rounded w-2/3" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="bg-white rounded-lg shadow-lg p-6 text-center text-forest-400 font-body">
        Project not found.
      </div>
    );
  }

  const cat = CATEGORIES[project.category];
  const statusStyle = STATUS_STYLES[project.status];

  return (
    <div className="bg-white rounded-lg shadow-lg overflow-hidden">
      {/* Header */}
      <div className="p-4 sm:p-6" style={{ borderTop: `4px solid ${cat.color}` }}>
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-2">
            <span className="text-2xl" aria-hidden="true">
              {cat.icon}
            </span>
            <div>
              <h2 className="font-heading font-bold text-lg sm:text-xl text-forest-800">
                {project.title}
              </h2>
              {project.location_name && (
                <p className="text-forest-500 text-sm font-body mt-0.5">
                  {project.location_name}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-forest-400 hover:text-forest-700 transition-colors p-1"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 mt-3">
          <span
            className="text-xs font-body px-2.5 py-1 rounded-full"
            style={{ backgroundColor: statusStyle.bg, color: statusStyle.color }}
          >
            {statusStyle.label}
          </span>
          <span
            className="text-xs font-body px-2.5 py-1 rounded-full"
            style={{ backgroundColor: `${cat.color}20`, color: cat.color }}
          >
            {cat.label}
          </span>
        </div>
      </div>

      {/* Body */}
      <div className="px-4 sm:px-6 pb-4 sm:pb-6 space-y-4 font-body text-sm">
        {project.description && (
          <p className="text-forest-700 leading-relaxed">{project.description}</p>
        )}

        <div className="grid grid-cols-2 gap-3 text-forest-600">
          {project.timeline_text && (
            <div>
              <p className="text-xs text-forest-400 uppercase tracking-wider">Timeline</p>
              <p className="mt-0.5">{project.timeline_text}</p>
            </div>
          )}
          {project.funding_source && (
            <div>
              <p className="text-xs text-forest-400 uppercase tracking-wider">Funding</p>
              <p className="mt-0.5">{project.funding_source}</p>
            </div>
          )}
          {project.estimated_cost && (
            <div>
              <p className="text-xs text-forest-400 uppercase tracking-wider">Est. Cost</p>
              <p className="mt-0.5">${project.estimated_cost.toLocaleString()}</p>
            </div>
          )}
          {project.start_date && (
            <div>
              <p className="text-xs text-forest-400 uppercase tracking-wider">Start Date</p>
              <p className="mt-0.5">
                {new Date(project.start_date).toLocaleDateString()}
              </p>
            </div>
          )}
        </div>

        {project.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {project.tags.map((tag) => (
              <span
                key={tag}
                className="bg-cream-100 text-forest-600 text-xs px-2 py-0.5 rounded-full"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {project.source_url && (
          <a
            href={project.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-forest-600 underline hover:text-forest-800 text-xs"
          >
            View Source Document
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        )}

        {/* Updates timeline */}
        {project.updates && project.updates.length > 0 && (
          <div className="pt-4 border-t border-cream-200">
            <h3 className="font-heading font-semibold text-forest-800 mb-3">
              Update History
            </h3>
            <div className="space-y-3">
              {project.updates.map((update) => (
                <div
                  key={update.id}
                  className="pl-4 border-l-2 border-cream-300"
                >
                  <p className="text-forest-700 text-sm">
                    {update.update_text}
                  </p>
                  <p className="text-forest-400 text-xs mt-1">
                    {update.source_date
                      ? new Date(update.source_date).toLocaleDateString()
                      : new Date(update.created_at).toLocaleDateString()}
                    {update.source_url && (
                      <>
                        {" "}
                        &middot;{" "}
                        <a
                          href={update.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline hover:text-forest-600"
                        >
                          Source
                        </a>
                      </>
                    )}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
