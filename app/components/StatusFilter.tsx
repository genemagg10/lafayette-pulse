"use client";

import { STATUS_STYLES, type ProjectStatus } from "@/lib/categories";

interface StatusFilterProps {
  activeStatus: ProjectStatus | null;
  onSelect: (status: ProjectStatus | null) => void;
}

export default function StatusFilter({
  activeStatus,
  onSelect,
}: StatusFilterProps) {
  return (
    <div className="flex flex-wrap gap-2">
      <button
        onClick={() => onSelect(null)}
        className={`px-3 py-1 rounded-full text-sm font-body transition-all border ${
          activeStatus === null
            ? "bg-forest-800 text-cream-50 border-forest-800"
            : "bg-transparent text-ink border-line-strong hover:border-forest-800"
        }`}
      >
        All
      </button>
      {(Object.keys(STATUS_STYLES) as ProjectStatus[]).map((key) => {
        const style = STATUS_STYLES[key];
        const isActive = activeStatus === key;

        return (
          <button
            key={key}
            onClick={() => onSelect(isActive ? null : key)}
            className="px-3 py-1 rounded-full text-sm font-body transition-all border"
            style={{
              backgroundColor: isActive ? style.bg : "transparent",
              borderColor: isActive ? style.color : "#DDDDD0",
              color: style.color,
              fontWeight: isActive ? 600 : 400,
            }}
          >
            {style.label}
          </button>
        );
      })}
    </div>
  );
}
