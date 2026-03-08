"use client";

import { useEffect, useState } from "react";
import { CATEGORIES, migrateCategory } from "@/lib/categories";
import type { AgendaItem, ProjectCategory } from "@/lib/types";

interface AgendaFeedProps {
  activeCategories: Set<ProjectCategory>;
}

export default function AgendaFeed({ activeCategories }: AgendaFeedProps) {
  const [items, setItems] = useState<AgendaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"upcoming" | "archive">("upcoming");

  useEffect(() => {
    setLoading(true);
    const today = new Date().toISOString().split("T")[0];
    const params = new URLSearchParams();
    if (activeCategories.size > 0) {
      params.set("category", Array.from(activeCategories).join(","));
    }
    if (view === "upcoming") {
      params.set("since", today);
      params.set("upcoming", "true");
    } else {
      params.set("until", today);
    }
    fetch(`/api/agenda-items?${params}`)
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setItems(
            data.map((item: AgendaItem) => ({
              ...item,
              category: item.category ? migrateCategory(item.category) : null,
            })),
          );
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [activeCategories, view]);

  if (loading) {
    return (
      <div className="space-y-3 animate-pulse">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white rounded-lg p-4">
            <div className="h-4 bg-cream-200 rounded w-1/3 mb-2" />
            <div className="h-3 bg-cream-200 rounded w-full mb-1" />
            <div className="h-3 bg-cream-200 rounded w-2/3" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button
          onClick={() => setView("upcoming")}
          className={`px-3 py-1.5 rounded-full text-xs font-body font-medium transition-colors ${
            view === "upcoming"
              ? "bg-forest-700 text-white"
              : "bg-cream-100 text-forest-500 hover:bg-cream-200"
          }`}
        >
          Upcoming
        </button>
        <button
          onClick={() => setView("archive")}
          className={`px-3 py-1.5 rounded-full text-xs font-body font-medium transition-colors ${
            view === "archive"
              ? "bg-forest-700 text-white"
              : "bg-cream-100 text-forest-500 hover:bg-cream-200"
          }`}
        >
          Archive
        </button>
      </div>

      {items.length === 0 && !loading ? (
        <div className="text-center py-8 text-forest-400 font-body">
          {view === "upcoming"
            ? "No upcoming events match your filters."
            : "No past events match your filters."}
        </div>
      ) : (
        items.map((item) => {
          const cat = item.category ? CATEGORIES[item.category] : null;

          return (
            <div
              key={item.id}
              className="bg-white rounded-lg shadow-sm border border-cream-200 p-4"
              style={{
                borderLeftWidth: "3px",
                borderLeftColor: cat ? cat.color : "#DDDDD0",
              }}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-body text-forest-400">
                    <span className="uppercase tracking-wide text-forest-400 text-xs">Meeting </span>
                    <span className="font-semibold text-forest-700 text-sm">
                      {new Date(item.date).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </span>
                    <span className="mx-1.5">&middot;</span>
                    {item.body}
                  </p>
                  <h4 className="font-heading font-semibold text-forest-800 text-sm mt-1">
                    {item.title}
                  </h4>
                </div>
                {cat && (
                  <span
                    className="text-xs font-body px-2 py-0.5 rounded-full flex-shrink-0"
                    style={{
                      backgroundColor: `${cat.color}20`,
                      color: cat.color,
                    }}
                  >
                    {cat.icon} {cat.label}
                  </span>
                )}
              </div>

              {item.description && (
                <p className="text-forest-600 text-sm font-body mt-2 leading-relaxed">
                  {item.description}
                </p>
              )}

              <div className="flex items-center gap-2 mt-2 flex-wrap">
                {item.tags.map((tag) => (
                  <span
                    key={tag}
                    className="bg-cream-100 text-forest-500 text-xs px-2 py-0.5 rounded-full font-body"
                  >
                    {tag}
                  </span>
                ))}
                {item.source_url && (
                  <a
                    href={item.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-body text-forest-600 underline hover:text-forest-800"
                  >
                    View Source ↗
                  </a>
                )}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
