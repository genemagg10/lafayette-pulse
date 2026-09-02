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
  children?: ReactNode;
}

export default function PulseTile({
  id,
  title,
  icon,
  summary,
  expanded,
  onToggle,
  children,
}: PulseTileProps) {
  return (
    <section
      id={`tile-${id}`}
      className={`bg-white rounded-xl border border-cream-200 shadow-sm overflow-hidden transition-all duration-300 ${
        expanded ? "md:col-span-2 xl:col-span-3" : ""
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-cream-50 transition-colors"
      >
        <div
          className="w-10 h-10 rounded-lg bg-forest-50 text-forest-800 flex items-center justify-center text-xl flex-shrink-0"
          aria-hidden="true"
        >
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="font-heading font-bold text-forest-800 text-base sm:text-lg">
            {title}
          </h2>
          <p className="text-sm text-forest-500 font-body truncate">{summary}</p>
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
        <div className="border-t border-cream-200 p-4 animate-in">
          {children}
        </div>
      )}
    </section>
  );
}
