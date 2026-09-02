"use client";

import { useEffect, useMemo, useState } from "react";
import CalendarItemCard from "./CalendarItemCard";
import { CATEGORIES } from "@/lib/categories";
import {
  EVENT_TYPE_STYLES,
  calendarAccent,
  fetchCalendarItems,
  todayKeyPacific,
  type CalendarItem,
} from "@/lib/calendar-items";
import type { ProjectCategory } from "@/lib/types";

interface AgendaCalendarProps {
  activeCategories: Set<ProjectCategory>;
  view?: "month" | "week";
  selectedDay?: string | null;
  onSelectDay?: (day: string | null) => void;
  showDayDrawer?: boolean;
  chrome?: "card" | "plain";
}

function formatDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function chipStyle(item: CalendarItem): { backgroundColor: string; color: string } {
  if (item.kind === "agenda" && item.category) {
    const cat = CATEGORIES[item.category];
    return {
      backgroundColor: `${cat.color}20`,
      color: cat.color,
    };
  }
  const color =
    item.kind === "event" && item.event_type
      ? EVENT_TYPE_STYLES[item.event_type].color
      : calendarAccent(item);
  return {
    backgroundColor: `${color}20`,
    color,
  };
}

export default function AgendaCalendar({
  activeCategories,
  view = "month",
  selectedDay: selectedDayProp,
  onSelectDay,
  showDayDrawer = true,
  chrome = "card",
}: AgendaCalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [weekStart, setWeekStart] = useState(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    now.setDate(now.getDate() - now.getDay());
    return now;
  });
  const [items, setItems] = useState<CalendarItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [internalDay, setInternalDay] = useState<string | null>(null);
  const selectedDay = selectedDayProp !== undefined ? selectedDayProp : internalDay;

  const setSelectedDay = (day: string | null) => {
    onSelectDay?.(day);
    if (selectedDayProp === undefined) setInternalDay(day);
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    let since: string;
    let until: string;
    if (view === "week") {
      const end = new Date(weekStart);
      end.setDate(end.getDate() + 7);
      since = formatDateKey(weekStart);
      until = formatDateKey(end);
    } else {
      since = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, "0")}-01`;
      const nextMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1);
      until = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, "0")}-01`;
    }

    const category =
      activeCategories.size > 0
        ? Array.from(activeCategories).join(",")
        : undefined;

    fetchCalendarItems({ since, until, category, limit: 100 })
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
  }, [currentMonth, weekStart, view, activeCategories]);

  const itemsByDay = useMemo(() => {
    const map: Record<string, CalendarItem[]> = {};
    for (const item of items) {
      const day = item.dayKey;
      if (!map[day]) map[day] = [];
      map[day].push(item);
    }
    return map;
  }, [items]);

  const { daysInMonth, startOffset } = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    return {
      daysInMonth: new Date(year, month + 1, 0).getDate(),
      startOffset: new Date(year, month, 1).getDay(),
    };
  }, [currentMonth]);

  const todayKey = todayKeyPacific();

  const formatDayKey = (day: number) => {
    const y = currentMonth.getFullYear();
    const m = String(currentMonth.getMonth() + 1).padStart(2, "0");
    const d = String(day).padStart(2, "0");
    return `${y}-${m}-${d}`;
  };

  const prevPeriod = () => {
    if (view === "week") {
      setWeekStart((d) => {
        const next = new Date(d);
        next.setDate(next.getDate() - 7);
        return next;
      });
    } else {
      setCurrentMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1));
    }
    setSelectedDay(null);
  };

  const nextPeriod = () => {
    if (view === "week") {
      setWeekStart((d) => {
        const next = new Date(d);
        next.setDate(next.getDate() + 7);
        return next;
      });
    } else {
      setCurrentMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1));
    }
    setSelectedDay(null);
  };

  const monthLabel =
    view === "week"
      ? `${weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${(() => {
          const end = new Date(weekStart);
          end.setDate(end.getDate() + 6);
          return end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
        })()}`
      : currentMonth.toLocaleDateString("en-US", {
          month: "long",
          year: "numeric",
        });

  const selectedItems = selectedDay ? (itemsByDay[selectedDay] ?? []) : [];

  return (
    <div
      className={
        chrome === "plain"
          ? "overflow-hidden"
          : "bg-surface border border-line overflow-hidden"
      }
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-line">
        <button
          onClick={prevPeriod}
          className="p-1.5 rounded hover:bg-surface-muted text-forest-600 text-lg leading-none"
          aria-label={view === "week" ? "Previous week" : "Previous month"}
        >
          ‹
        </button>
        <h3 className="font-heading font-semibold text-ink">{monthLabel}</h3>
        <button
          onClick={nextPeriod}
          className="p-1.5 rounded hover:bg-surface-muted text-forest-600 text-lg leading-none"
          aria-label={view === "week" ? "Next week" : "Next month"}
        >
          ›
        </button>
      </div>

      <div className="grid grid-cols-7 border-b border-line">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div
            key={d}
            className="py-2 text-center text-xs font-body font-medium text-forest-400"
          >
            {d}
          </div>
        ))}
      </div>

      {loading ? (
        <div className="p-2 animate-pulse">
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: view === "week" ? 7 : 35 }).map((_, i) => (
              <div key={i} className="h-14 bg-surface-muted rounded" />
            ))}
          </div>
        </div>
      ) : view === "week" ? (
        <div className="grid grid-cols-7">
          {Array.from({ length: 7 }, (_, i) => {
            const date = new Date(weekStart);
            date.setDate(weekStart.getDate() + i);
            const key = formatDateKey(date);
            const dayItems = itemsByDay[key] ?? [];
            const isSelected = selectedDay === key;
            const isToday = key === todayKey;
            return (
              <button
                key={key}
                onClick={() => setSelectedDay(isSelected ? null : key)}
                className={`min-h-[140px] p-1.5 text-left border-r border-b border-line transition-colors w-full ${
                  isSelected
                    ? "bg-forest-soft ring-1 ring-inset ring-forest-300"
                    : "hover:bg-canvas"
                }`}
              >
                <span
                  className={`text-xs font-body block mb-1 w-5 h-5 flex items-center justify-center rounded-full ${
                    isToday
                      ? "bg-forest-700 text-white font-bold text-[10px]"
                      : "text-forest-600"
                  }`}
                >
                  {date.getDate()}
                </span>
                <div className="space-y-0.5">
                  {dayItems.slice(0, 4).map((item) => {
                    const style = chipStyle(item);
                    return (
                      <div
                        key={item.id}
                        className={`text-[10px] font-body truncate px-1 py-0.5 rounded ${
                          item.projected ? "opacity-80" : ""
                        }`}
                        style={style}
                      >
                        {item.projected ? "· " : ""}
                        {item.title}
                      </div>
                    );
                  })}
                  {dayItems.length > 4 && (
                    <div className="text-[10px] text-forest-400 font-body px-1">
                      +{dayItems.length - 4} more
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-7">
          {Array.from({ length: startOffset }).map((_, i) => (
            <div
              key={`empty-${i}`}
              className="min-h-[60px] border-r border-b border-line bg-surface-muted"
            />
          ))}
          {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
            const key = formatDayKey(day);
            const dayItems = itemsByDay[key] ?? [];
            const isSelected = selectedDay === key;
            const isToday = key === todayKey;

            return (
              <button
                key={day}
                onClick={() => setSelectedDay(isSelected ? null : key)}
                className={`min-h-[60px] p-1.5 text-left border-r border-b border-line transition-colors w-full ${
                  isSelected
                    ? "bg-forest-soft ring-1 ring-inset ring-forest-300"
                    : "hover:bg-canvas"
                }`}
              >
                <span
                  className={`text-xs font-body block mb-1 w-5 h-5 flex items-center justify-center rounded-full ${
                    isToday
                      ? "bg-forest-700 text-white font-bold text-[10px]"
                      : "text-forest-600"
                  }`}
                >
                  {day}
                </span>
                <div className="space-y-0.5">
                  {dayItems.slice(0, 2).map((item) => {
                    const style = chipStyle(item);
                    return (
                      <div
                        key={item.id}
                        className={`text-[10px] font-body truncate px-1 py-0.5 rounded ${
                          item.projected ? "opacity-80" : ""
                        }`}
                        style={style}
                      >
                        {item.projected ? "· " : ""}
                        {item.title}
                      </div>
                    );
                  })}
                  {dayItems.length > 2 && (
                    <div className="text-[10px] text-forest-400 font-body px-1">
                      +{dayItems.length - 2} more
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {showDayDrawer && selectedDay && (
        <div className="border-t border-line p-4 space-y-2">
          <h4 className="font-heading font-semibold text-ink text-sm">
            {new Date(`${selectedDay}T12:00:00`).toLocaleDateString("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
          </h4>
          {selectedItems.length === 0 ? (
            <p className="text-forest-400 font-body text-sm">No events scheduled.</p>
          ) : (
            selectedItems.map((item) => (
              <CalendarItemCard key={item.id} item={item} compact />
            ))
          )}
        </div>
      )}
    </div>
  );
}
