"use client";

import type { ReactNode } from "react";

export type TileId =
  | "projects"
  | "map"
  | "calendar"
  | "organizations"
  | "people"
  | "measures";

interface PulseTileProps {
  id: TileId;
  title: string;
  icon: string;
  summary: string;
  expanded: boolean;
  onToggle: () => void;
  className?: string;
  children?: ReactNode;
}

export default function PulseTile({
  id,
  title,
  icon: _icon,
  summary,
  expanded,
  onToggle,
  className,
  children,
}: PulseTileProps) {
  return (
    <section
      id={`tile-${id}`}
      className={`bg-surface border border-line overflow-hidden transition-all duration-300 ${
        expanded ? "md:col-span-2 xl:col-span-3" : ""
      } ${className ?? ""}`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-canvas transition-colors"
      >
        <div className="flex-1 min-w-0">
          <h2 className="font-heading font-bold text-ink text-base sm:text-lg">
            {title}
          </h2>
          <p className="text-sm text-ink-muted font-body truncate">{summary}</p>
        </div>
        <svg
          className={`w-5 h-5 text-forest-400 flex-shrink-0 transition-transform duration-300 ${
            expanded ? "rotate-180" : ""
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>
      {expanded && (
        <div className="border-t border-line p-4 animate-in">
          {children}
        </div>
      )}
    </section>
  );
}
