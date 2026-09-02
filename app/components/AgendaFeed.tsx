"use client";

import { useEffect, useState } from "react";
import CalendarItemCard from "./CalendarItemCard";
import {
  fetchCalendarItems,
  todayKeyPacific,
  type CalendarItem,
} from "@/lib/calendar-items";
import type { ProjectCategory } from "@/lib/types";

interface AgendaFeedProps {
  activeCategories: Set<ProjectCategory>;
  filterDay?: string | null;
  onSelectItem?: (item: CalendarItem) => void;
  selectedItemId?: string | null;
}

export default function AgendaFeed({
  activeCategories,
  filterDay,
  onSelectItem,
  selectedItemId,
}: AgendaFeedProps) {
  const [items, setItems] = useState<CalendarItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"upcoming" | "archive">("upcoming");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const today = todayKeyPacific();
    const category =
      activeCategories.size > 0
        ? Array.from(activeCategories).join(",")
        : undefined;

    let since: string | undefined;
    let until: string | undefined;
    let upcoming = false;

    if (filterDay) {
      since = filterDay;
      const next = new Date(`${filterDay}T12:00:00`);
      next.setDate(next.getDate() + 1);
      until = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`;
    } else if (view === "upcoming") {
      since = today;
      upcoming = true;
    } else {
      until = today;
    }

    fetchCalendarItems({
      since,
      until,
      upcoming,
      category,
      limit: 100,
    })
      .then((data) => {
        if (!cancelled) setItems(data);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeCategories, view, filterDay]);

  if (loading) {
    return (
      <div className="space-y-3 animate-pulse">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-surface rounded-lg p-4">
            <div className="h-4 bg-line rounded w-1/3 mb-2" />
            <div className="h-3 bg-line rounded w-full mb-1" />
            <div className="h-3 bg-line rounded w-2/3" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        {!filterDay && (
          <>
            <button
              onClick={() => setView("upcoming")}
              className={`px-3 py-1.5 rounded-full text-xs font-body font-medium transition-colors ${
                view === "upcoming"
                  ? "bg-forest-700 text-white"
                  : "bg-surface-muted text-ink-muted hover:bg-line"
              }`}
            >
              Upcoming
            </button>
            <button
              onClick={() => setView("archive")}
              className={`px-3 py-1.5 rounded-full text-xs font-body font-medium transition-colors ${
                view === "archive"
                  ? "bg-forest-700 text-white"
                  : "bg-surface-muted text-ink-muted hover:bg-line"
              }`}
            >
              Archive
            </button>
          </>
        )}
      </div>

      {items.length === 0 && !loading ? (
        <div className="text-center py-8 text-forest-400 font-body">
          {filterDay
            ? "No events on this day."
            : view === "upcoming"
            ? "No upcoming events match your filters."
            : "No past events match your filters."}
        </div>
      ) : (
        items.map((item) => (
          <CalendarItemCard
            key={item.id}
            item={item}
            selected={selectedItemId === item.id}
            onSelect={onSelectItem}
          />
        ))
      )}
    </div>
  );
}
