"use client";

import { useEffect, useMemo, useState } from "react";
import CalendarItemCard from "./CalendarItemCard";
import { formatGroupDay } from "@/lib/calendar-layout";
import {
  fetchCalendarItems,
  shiftDayKey,
  todayKeyPacific,
  upcomingWindow,
  type CalendarItem,
} from "@/lib/calendar-items";
import type { ProjectCategory } from "@/lib/types";

interface AgendaFeedProps {
  activeCategories: Set<ProjectCategory>;
  filterDay?: string | null;
  openItemId?: string | null;
  onToggleItem?: (item: CalendarItem) => void;
  heading?: string;
}

export default function AgendaFeed({
  activeCategories,
  filterDay,
  openItemId,
  onToggleItem,
  heading,
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
      until = shiftDayKey(filterDay, 1);
    } else if (view === "upcoming") {
      const window = upcomingWindow(today);
      since = window.since;
      until = window.until;
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

  const groups = useMemo(() => groupByDay(items), [items]);
  const title = filterDay
    ? (heading ?? "This day")
    : view === "archive"
      ? "Archive"
      : "Upcoming";

  if (loading) {
    return (
      <div className="space-y-3 animate-pulse">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-surface border border-line p-4">
            <div className="h-4 bg-line w-1/3 mb-2" />
            <div className="h-3 bg-line w-full mb-1" />
            <div className="h-3 bg-line w-2/3" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-heading font-semibold text-ink text-sm">{title}</h2>
        {!filterDay ? (
          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={() => setView("upcoming")}
              className={`px-3 py-1.5 text-xs font-body font-medium transition-colors ${
                view === "upcoming"
                  ? "bg-forest text-surface"
                  : "bg-surface-muted text-ink-muted hover:bg-line"
              }`}
            >
              Upcoming
            </button>
            <button
              type="button"
              onClick={() => setView("archive")}
              className={`px-3 py-1.5 text-xs font-body font-medium transition-colors ${
                view === "archive"
                  ? "bg-forest text-surface"
                  : "bg-surface-muted text-ink-muted hover:bg-line"
              }`}
            >
              Archive
            </button>
          </div>
        ) : null}
      </div>

      {items.length === 0 ? (
        <div className="py-8 text-forest-400 font-body text-sm">
          {filterDay
            ? "No events on this day."
            : view === "upcoming"
              ? "No upcoming events in the next 7 days."
              : "No past events match your filters."}
        </div>
      ) : (
        groups.map(([day, dayItems]) => (
          <section key={day} className="space-y-2">
            {!filterDay ? (
              <h3 className="text-[11px] font-body uppercase tracking-wide text-ink-muted">
                {formatGroupDay(day)}
              </h3>
            ) : null}
            {dayItems.map((item) => (
              <CalendarItemCard
                key={item.id}
                item={item}
                open={openItemId === item.id}
                onToggle={onToggleItem}
              />
            ))}
          </section>
        ))
      )}
    </div>
  );
}

function groupByDay(items: CalendarItem[]): [string, CalendarItem[]][] {
  const map = new Map<string, CalendarItem[]>();
  for (const item of items) {
    const list = map.get(item.dayKey);
    if (list) list.push(item);
    else map.set(item.dayKey, [item]);
  }
  return Array.from(map.entries());
}
