"use client";

import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import CalendarItemCard from "./CalendarItemCard";
import { formatGroupDay } from "@/lib/calendar-layout";
import {
  fetchCalendarItems,
  shiftDayKey,
  todayKeyPacific,
  type CalendarItem,
} from "@/lib/calendar-items";
import {
  formatMonthName,
  formatMonthTitle,
  monthContainsDay,
  monthWindow,
  shiftMonth,
} from "@/lib/calendar-time";
import type { ProjectCategory } from "@/lib/types";

interface AgendaFeedProps {
  activeCategories: Set<ProjectCategory>;
  filterDay?: string | null;
  openItemId?: string | null;
  onToggleItem?: (item: CalendarItem) => void;
  heading?: string;
  visibleMonth?: Date;
  onAdvanceMonth?: () => void;
}

export default function AgendaFeed({
  activeCategories,
  filterDay,
  openItemId,
  onToggleItem,
  heading,
  visibleMonth,
  onAdvanceMonth,
}: AgendaFeedProps) {
  const [items, setItems] = useState<CalendarItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"month" | "archive">("month");
  const today = todayKeyPacific();
  const month = useMemo(() => {
    if (visibleMonth) return visibleMonth;
    return new Date(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1, 1);
  }, [visibleMonth, today]);

  useEffect(() => {
    setView("month");
  }, [visibleMonth, filterDay]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
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
      upcoming = true;
    } else if (view === "month") {
      const window = monthWindow(month);
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
  }, [activeCategories, view, filterDay, month, today]);

  const groups = useMemo(() => groupByDay(items), [items]);
  const showingMonth = !filterDay && view === "month";
  const title = filterDay
    ? (heading ?? "This day")
    : view === "archive"
      ? "Archive"
      : (heading ?? formatMonthTitle(month));
  const nextMonthLabel = formatMonthName(shiftMonth(month, 1));
  const scrollToToday = showingMonth && monthContainsDay(month, today);
  const anchorDay = scrollToToday
    ? (groups.find(([day]) => day >= today)?.[0] ?? null)
    : null;

  useLayoutEffect(() => {
    if (!anchorDay || loading) return;
    const section = document.getElementById(`rail-day-${anchorDay}`);
    const scroller = section?.closest("[data-rail-scroll]");
    if (!section || !(scroller instanceof HTMLElement)) return;
    const sectionRect = section.getBoundingClientRect();
    const scrollerRect = scroller.getBoundingClientRect();
    scroller.scrollTop += sectionRect.top - scrollerRect.top;
  }, [anchorDay, loading, items]);

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
              onClick={() => setView("month")}
              className={`px-3 py-1.5 text-xs font-body font-medium transition-colors ${
                view === "month"
                  ? "bg-forest text-surface"
                  : "bg-surface-muted text-ink-muted hover:bg-line"
              }`}
            >
              Month
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
            : view === "archive"
              ? "No past events match your filters."
              : `No events in ${formatMonthTitle(month)}.`}
        </div>
      ) : (
        groups.map(([day, dayItems]) => (
          <section key={day} id={`rail-day-${day}`} className="space-y-2">
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

      {showingMonth && onAdvanceMonth ? (
        <button
          type="button"
          onClick={onAdvanceMonth}
          className="block w-full text-left text-[12px] font-body text-ink-muted pt-1 pb-2 hover:text-ink"
        >
          More in {nextMonthLabel}
        </button>
      ) : null}
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
