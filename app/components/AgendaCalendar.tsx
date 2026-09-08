"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import {
  EVENT_LINE_PX,
  cellVisibleCount,
  eventLineText,
  gridRowTemplate,
  meetingKindRule,
  monthGridRows,
  monthTrailingEmpties,
} from "@/lib/calendar-layout";
import {
  fetchCalendarItems,
  sortCalendarItems,
  todayKeyPacific,
  type CalendarItem,
} from "@/lib/calendar-items";
import type { ProjectCategory } from "@/lib/types";

interface AgendaCalendarProps {
  activeCategories: Set<ProjectCategory>;
  view?: "month" | "week";
  onChangeView?: (view: "month" | "week") => void;
  selectedDay?: string | null;
  onSelectDay?: (day: string | null) => void;
  density?: "fill" | "compact";
}

function formatDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export default function AgendaCalendar({
  activeCategories,
  view = "month",
  onChangeView,
  selectedDay: selectedDayProp,
  onSelectDay,
  density = "fill",
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
    for (const day of Object.keys(map)) {
      map[day] = sortCalendarItems(map[day], true);
    }
    return map;
  }, [items]);

  const { daysInMonth, startOffset, rowCount } = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const days = new Date(year, month + 1, 0).getDate();
    const offset = new Date(year, month, 1).getDay();
    return {
      daysInMonth: days,
      startOffset: offset,
      rowCount: monthGridRows(offset, days),
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
          return end.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          });
        })()}`
      : currentMonth.toLocaleDateString("en-US", {
          month: "long",
          year: "numeric",
        });

  const trailing = monthTrailingEmpties(startOffset, daysInMonth);
  const fillRows = view === "week" ? 1 : rowCount;
  const compact = density === "compact";

  return (
    <div className={`min-h-0 flex flex-col ${compact ? "" : "flex-1 h-full"}`}>
      <div className="flex-shrink-0 flex items-center gap-3 px-4 h-12 border-b border-line bg-surface">
        <div className="flex items-center gap-1 min-w-0 flex-1">
          <button
            type="button"
            onClick={prevPeriod}
            className="p-1.5 text-forest-600 text-lg leading-none hover:bg-surface-muted"
            aria-label={view === "week" ? "Previous week" : "Previous month"}
          >
            ‹
          </button>
          <h1 className="font-heading font-semibold text-ink truncate">{monthLabel}</h1>
          <button
            type="button"
            onClick={nextPeriod}
            className="p-1.5 text-forest-600 text-lg leading-none hover:bg-surface-muted"
            aria-label={view === "week" ? "Next week" : "Next month"}
          >
            ›
          </button>
        </div>
        {onChangeView && !compact ? (
          <ViewToggle view={view} onChange={onChangeView} />
        ) : null}
      </div>

      <div
        className={`grid grid-cols-7 border-b border-line bg-surface ${
          compact ? "" : "flex-shrink-0"
        }`}
      >
        {(compact
          ? ["S", "M", "T", "W", "T", "F", "S"]
          : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
        ).map((d, i) => (
          <div
            key={`${d}-${i}`}
            className="py-1.5 text-center text-[11px] font-body font-medium text-ink-muted"
          >
            {d}
          </div>
        ))}
      </div>

      {loading ? (
        <CalendarGridFrame compact={compact} rows={fillRows}>
          {Array.from({ length: view === "week" ? 7 : fillRows * 7 }).map((_, i) => (
            <div
              key={i}
              className={compact ? "h-8 bg-surface-muted" : "h-full min-h-0 bg-surface-muted"}
            />
          ))}
        </CalendarGridFrame>
      ) : view === "week" ? (
        <WeekGrid
          weekStart={weekStart}
          itemsByDay={itemsByDay}
          selectedDay={selectedDay}
          todayKey={todayKey}
          compact={compact}
          onSelectDay={setSelectedDay}
        />
      ) : (
        <MonthGrid
          startOffset={startOffset}
          daysInMonth={daysInMonth}
          trailing={trailing}
          rowCount={rowCount}
          formatDayKey={formatDayKey}
          itemsByDay={itemsByDay}
          selectedDay={selectedDay}
          todayKey={todayKey}
          compact={compact}
          onSelectDay={setSelectedDay}
        />
      )}
    </div>
  );
}

function ViewToggle({
  view,
  onChange,
}: {
  view: "month" | "week";
  onChange: (view: "month" | "week") => void;
}) {
  return (
    <div className="inline-flex border border-line bg-surface p-0.5">
      {(["month", "week"] as const).map((id) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          className={`px-3 py-1 text-xs font-body ${
            view === id ? "bg-forest text-surface" : "text-forest-600 hover:bg-canvas"
          }`}
        >
          {id === "month" ? "Month" : "Week"}
        </button>
      ))}
    </div>
  );
}

function MonthGrid({
  startOffset,
  daysInMonth,
  trailing,
  rowCount,
  formatDayKey,
  itemsByDay,
  selectedDay,
  todayKey,
  compact,
  onSelectDay,
}: {
  startOffset: number;
  daysInMonth: number;
  trailing: number;
  rowCount: number;
  formatDayKey: (day: number) => string;
  itemsByDay: Record<string, CalendarItem[]>;
  selectedDay: string | null;
  todayKey: string;
  compact: boolean;
  onSelectDay: (day: string | null) => void;
}) {
  const gridRef = useRef<HTMLDivElement>(null);
  const maxLines = useEventLineCapacity(gridRef, rowCount, compact);

  return (
    <CalendarGridFrame compact={compact} rows={rowCount} gridRef={gridRef}>
      {Array.from({ length: startOffset }).map((_, i) => (
        <EmptyCell key={`lead-${i}`} compact={compact} />
      ))}
      {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
        const key = formatDayKey(day);
        return (
          <DayCell
            key={key}
            dayKey={key}
            numeral={day}
            items={itemsByDay[key] ?? []}
            selected={selectedDay === key}
            today={key === todayKey}
            compact={compact}
            maxLines={maxLines}
            onSelect={() => onSelectDay(selectedDay === key ? null : key)}
          />
        );
      })}
      {Array.from({ length: trailing }).map((_, i) => (
        <EmptyCell key={`trail-${i}`} compact={compact} />
      ))}
    </CalendarGridFrame>
  );
}

function WeekGrid({
  weekStart,
  itemsByDay,
  selectedDay,
  todayKey,
  compact,
  onSelectDay,
}: {
  weekStart: Date;
  itemsByDay: Record<string, CalendarItem[]>;
  selectedDay: string | null;
  todayKey: string;
  compact: boolean;
  onSelectDay: (day: string | null) => void;
}) {
  const gridRef = useRef<HTMLDivElement>(null);
  const maxLines = useEventLineCapacity(gridRef, 1, compact);

  return (
    <CalendarGridFrame compact={compact} rows={1} gridRef={gridRef}>
      {Array.from({ length: 7 }, (_, i) => {
        const date = new Date(weekStart);
        date.setDate(weekStart.getDate() + i);
        const key = formatDateKey(date);
        return (
          <DayCell
            key={key}
            dayKey={key}
            numeral={date.getDate()}
            items={itemsByDay[key] ?? []}
            selected={selectedDay === key}
            today={key === todayKey}
            compact={compact}
            maxLines={maxLines}
            onSelect={() => onSelectDay(selectedDay === key ? null : key)}
          />
        );
      })}
    </CalendarGridFrame>
  );
}

function CalendarGridFrame({
  compact,
  rows,
  gridRef,
  children,
}: {
  compact: boolean;
  rows: number;
  gridRef?: RefObject<HTMLDivElement>;
  children: ReactNode;
}) {
  return (
    <div
      ref={gridRef}
      className={`grid grid-cols-7 gap-px bg-line ${
        compact ? "" : "flex-1 min-h-0"
      }`}
      style={compact ? undefined : { gridTemplateRows: gridRowTemplate(rows) }}
    >
      {children}
    </div>
  );
}

function EmptyCell({ compact }: { compact: boolean }) {
  return (
    <div className={compact ? "h-8 bg-surface-muted" : "h-full min-h-0 bg-surface-muted"} />
  );
}

function DayCell({
  dayKey,
  numeral,
  items,
  selected,
  today,
  compact,
  maxLines,
  onSelect,
}: {
  dayKey: string;
  numeral: number;
  items: CalendarItem[];
  selected: boolean;
  today: boolean;
  compact: boolean;
  maxLines: number;
  onSelect: () => void;
}) {
  const { show, more } = cellVisibleCount(items.length, compact ? 0 : maxLines);
  const visible = items.slice(0, show);

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      aria-current={today ? "date" : undefined}
      aria-label={dayKey}
      className={`min-w-0 w-full text-left ${
        compact ? "h-8 px-1 py-0.5" : "h-full min-h-0 p-1.5 flex flex-col"
      } ${selected ? "bg-accent-soft" : "bg-surface hover:bg-canvas"}`}
    >
      <span
        className={`text-[12px] leading-4 font-body block ${
          selected || today ? "text-accent" : "text-ink-muted"
        }`}
      >
        {numeral}
      </span>
      {compact ? (
        items.length > 0 ? (
          <span className="block w-1 h-1 mt-0.5 bg-forest" />
        ) : null
      ) : (
        <div data-event-well className="flex-1 min-h-0 overflow-hidden mt-1">
          {visible.map((item) => (
            <div key={item.id} className="h-4 flex items-stretch min-w-0">
              <span
                className="w-[3px] shrink-0"
                style={{ backgroundColor: meetingKindRule(item) }}
              />
              <span className="min-w-0 truncate pl-1 text-[12px] leading-4 text-ink">
                {eventLineText(item)}
              </span>
            </div>
          ))}
          {more > 0 ? (
            <div className="h-4 text-[12px] leading-4 text-ink-muted pl-1">
              {more} more
            </div>
          ) : null}
        </div>
      )}
    </button>
  );
}

function useEventLineCapacity(
  gridRef: RefObject<HTMLDivElement>,
  rowCount: number,
  compact: boolean
): number {
  const [maxLines, setMaxLines] = useState(0);

  useEffect(() => {
    if (compact) return;
    const root = gridRef.current;
    if (!root) return;

    const measure = () => {
      const well = root.querySelector<HTMLElement>("[data-event-well]");
      if (!well) {
        setMaxLines(0);
        return;
      }
      setMaxLines(Math.max(0, Math.floor(well.clientHeight / EVENT_LINE_PX)));
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    const well = root.querySelector("[data-event-well]");
    if (well) ro.observe(well);
    return () => ro.disconnect();
  }, [gridRef, rowCount, compact]);

  return maxLines;
}
