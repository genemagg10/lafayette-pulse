"use client";

import { CATEGORIES, type ProjectCategory } from "@/lib/categories";

interface CategoryFilterProps {
  activeCategories: Set<ProjectCategory>;
  onToggle: (category: ProjectCategory) => void;
  counts: Record<ProjectCategory, number>;
}

export default function CategoryFilter({
  activeCategories,
  onToggle,
  counts,
}: CategoryFilterProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {(Object.keys(CATEGORIES) as ProjectCategory[]).map((key) => {
        const cat = CATEGORIES[key];
        const isActive = activeCategories.has(key);
        const count = counts[key] || 0;

        return (
          <button
            key={key}
            onClick={() => onToggle(key)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-body transition-all duration-200 border"
            style={{
              backgroundColor: isActive ? cat.color : "transparent",
              borderColor: cat.color,
              color: isActive ? "#fff" : cat.color,
              opacity: isActive ? 1 : 0.7,
            }}
          >
            <span aria-hidden="true">{cat.icon}</span>
            <span className="hidden sm:inline">{cat.label}</span>
            <span
              className="text-xs rounded-full px-1.5 py-0.5 min-w-[1.25rem] text-center"
              style={{
                backgroundColor: isActive
                  ? "rgba(255,255,255,0.25)"
                  : `${cat.color}20`,
              }}
            >
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
