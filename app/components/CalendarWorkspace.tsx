"use client";

import { useMemo, useState } from "react";
import AgendaCalendar from "./AgendaCalendar";
import AgendaFeed from "./AgendaFeed";
import CalendarItemCard from "./CalendarItemCard";
import FocusFrame from "./FocusFrame";
import type { CalendarItem } from "@/lib/calendar-items";
import type { ProjectCategory } from "@/lib/types";

export default function CalendarWorkspace() {
  const [view, setView] = useState<"month" | "week">("month");
  const [mobileGrid, setMobileGrid] = useState(false);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<CalendarItem | null>(null);
  const activeCategories = useMemo(() => new Set<ProjectCategory>(), []);

  return (
    <FocusFrame>
      <div className="h-full min-h-0 hidden md:grid md:grid-cols-[minmax(0,55fr)_minmax(0,45fr)]">
        <section className="min-h-0 overflow-y-auto border-r border-line bg-surface p-3">
          <div className="flex items-center justify-between mb-3">
            <h1 className="font-heading font-bold text-ink">Calendar</h1>
            <ViewToggle view={view} onChange={setView} />
          </div>
          <AgendaCalendar
            activeCategories={activeCategories}
            view={view}
            selectedDay={selectedDay}
            onSelectDay={(day) => {
              setSelectedDay(day);
              setSelectedItem(null);
            }}
            showDayDrawer={false}
            chrome="plain"
          />
        </section>
        <section className="min-h-0 overflow-y-auto bg-canvas p-3 space-y-4">
          <h2 className="font-heading font-semibold text-ink">
            {selectedDay
              ? new Date(`${selectedDay}T12:00:00`).toLocaleDateString("en-US", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                })
              : "Agenda"}
          </h2>
          <p className="text-xs font-body text-ink-muted -mt-2">
            Timed civic events plus agenda topics. Meetings marked Projected
            follow a recurring schedule until the city calendar confirms.
          </p>
          {selectedItem && (
            <SelectedAgendaDetail
              item={selectedItem}
              onClose={() => setSelectedItem(null)}
            />
          )}
          <AgendaFeed
            activeCategories={activeCategories}
            filterDay={selectedDay}
            onSelectItem={setSelectedItem}
            selectedItemId={selectedItem?.id ?? null}
          />
        </section>
      </div>

      <div className="md:hidden h-full min-h-0 flex flex-col">
        <div className="flex-shrink-0 flex items-center justify-between px-3 py-2 border-b border-line bg-surface">
          <h1 className="font-heading font-bold text-ink">Calendar</h1>
          <button
            type="button"
            onClick={() => setMobileGrid((open) => !open)}
            className="text-xs font-body px-3 py-1.5 border border-line text-forest-700"
          >
            {mobileGrid ? "Agenda" : "Month"}
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-4">
          {mobileGrid ? (
            <>
              <ViewToggle view={view} onChange={setView} />
              <AgendaCalendar
                activeCategories={activeCategories}
                view={view}
                selectedDay={selectedDay}
                onSelectDay={(day) => {
                  setSelectedDay(day);
                  setMobileGrid(false);
                }}
                showDayDrawer={false}
                chrome="plain"
              />
            </>
          ) : (
            <>
              <p className="text-xs font-body text-ink-muted">
                Timed civic events plus agenda topics. Meetings marked Projected
                follow a recurring schedule until the city calendar confirms.
              </p>
              {selectedItem && (
                <SelectedAgendaDetail
                  item={selectedItem}
                  onClose={() => setSelectedItem(null)}
                />
              )}
              <AgendaFeed
                activeCategories={activeCategories}
                filterDay={selectedDay}
                onSelectItem={setSelectedItem}
                selectedItemId={selectedItem?.id ?? null}
              />
            </>
          )}
        </div>
      </div>
    </FocusFrame>
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
          className={`px-3 py-1 text-xs font-body rounded-md capitalize ${
            view === id
              ? "bg-forest text-surface"
              : "text-forest-600 hover:bg-canvas"
          }`}
        >
          {id}
        </button>
      ))}
    </div>
  );
}

function SelectedAgendaDetail({
  item,
  onClose,
}: {
  item: CalendarItem;
  onClose: () => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={onClose}
          className="text-xs font-body text-ink-muted"
        >
          Close
        </button>
      </div>
      <CalendarItemCard item={item} selected />
    </div>
  );
}
