"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import AgendaCalendar from "./AgendaCalendar";
import AgendaFeed from "./AgendaFeed";
import CalendarItemCard from "./CalendarItemCard";
import FocusFrame from "./FocusFrame";
import { CARD_RAIL_PX, formatRailDay, weekRailStacks } from "@/lib/calendar-layout";
import { shiftMonth } from "@/lib/calendar-time";
import type { CalendarItem } from "@/lib/calendar-items";
import type { ProjectCategory } from "@/lib/types";

export default function CalendarWorkspace() {
  const [view, setView] = useState<"month" | "week">("month");
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [mobileMonth, setMobileMonth] = useState(false);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [openItemId, setOpenItemId] = useState<string | null>(null);
  const [sheetItem, setSheetItem] = useState<CalendarItem | null>(null);
  const [stackRail, setStackRail] = useState(false);
  const shellRef = useRef<HTMLDivElement>(null);
  const activeCategories = useMemo(() => new Set<ProjectCategory>(), []);

  const advanceMonth = () => {
    setVisibleMonth((month) => shiftMonth(month, 1));
    setSelectedDay(null);
    setOpenItemId(null);
    setSheetItem(null);
  };

  useEffect(() => {
    const el = shellRef.current;
    if (!el) return;
    const measure = () => {
      setStackRail(view === "week" && weekRailStacks(el.clientWidth));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [view]);

  const selectDay = (day: string | null) => {
    setSelectedDay(day);
    setOpenItemId(null);
    setSheetItem(null);
  };

  const railHeading = selectedDay ? formatRailDay(selectedDay) : undefined;

  return (
    <FocusFrame className="flex flex-col">
      <div
        ref={shellRef}
        className={`flex-1 min-h-0 hidden md:flex ${
          stackRail ? "flex-col" : "flex-row"
        }`}
      >
        <section className="flex-1 min-h-0 min-w-0 flex flex-col bg-surface">
          <AgendaCalendar
            activeCategories={activeCategories}
            view={view}
            onChangeView={setView}
            selectedDay={selectedDay}
            onSelectDay={selectDay}
            density="fill"
            visibleMonth={visibleMonth}
            onVisibleMonthChange={(month) => {
              setVisibleMonth((prev) =>
                prev.getTime() === month.getTime() ? prev : month
              );
            }}
          />
        </section>
        <aside
          data-rail-scroll
          className={`bg-canvas overflow-y-auto ${
            stackRail
              ? "w-full max-h-[42%] border-t border-line"
              : "h-full shrink-0 border-l border-line"
          }`}
          style={stackRail ? undefined : { width: CARD_RAIL_PX }}
        >
          <div className="p-3">
            <AgendaFeed
              activeCategories={activeCategories}
              filterDay={selectedDay}
              heading={railHeading}
              visibleMonth={visibleMonth}
              onAdvanceMonth={advanceMonth}
              openItemId={openItemId}
              onToggleItem={(item) => {
                setOpenItemId((id) => (id === item.id ? null : item.id));
              }}
            />
          </div>
        </aside>
      </div>

      <div className="md:hidden relative flex-1 min-h-0 flex flex-col">
        <div className="flex-shrink-0 flex items-center justify-between px-3 h-12 border-b border-line bg-surface">
          <h1 className="font-heading font-semibold text-ink">Calendar</h1>
          <button
            type="button"
            onClick={() => setMobileMonth((open) => !open)}
            className="text-xs font-body px-3 py-1.5 border border-line text-forest-700"
          >
            {mobileMonth ? "Hide month" : "Show month"}
          </button>
        </div>
        {mobileMonth ? (
          <div className="flex-shrink-0 border-b border-line">
            <AgendaCalendar
              activeCategories={activeCategories}
              view="month"
              selectedDay={selectedDay}
              onSelectDay={selectDay}
              density="compact"
              visibleMonth={visibleMonth}
              onVisibleMonthChange={(month) => {
                setVisibleMonth((prev) =>
                  prev.getTime() === month.getTime() ? prev : month
                );
              }}
            />
          </div>
        ) : null}
        <div data-rail-scroll className="flex-1 min-h-0 overflow-y-auto p-3">
          <AgendaFeed
            activeCategories={activeCategories}
            filterDay={selectedDay}
            heading={railHeading}
            visibleMonth={visibleMonth}
            onAdvanceMonth={advanceMonth}
            onToggleItem={setSheetItem}
          />
        </div>
        {sheetItem ? (
          <div className="absolute inset-0 z-20 flex flex-col justify-end">
            <button
              type="button"
              aria-label="Close event"
              className="absolute inset-0 bg-ink/30"
              onClick={() => setSheetItem(null)}
            />
            <div className="relative max-h-[75%] overflow-y-auto bg-surface border-t border-line shadow-sheet p-4">
              <div className="flex justify-center pb-3">
                <span className="w-10 h-1 bg-line" />
              </div>
              <CalendarItemCard item={sheetItem} open />
            </div>
          </div>
        ) : null}
      </div>
    </FocusFrame>
  );
}
