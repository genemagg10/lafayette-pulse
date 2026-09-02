"use client";

import { useMemo, useState } from "react";
import AgendaCalendar from "./AgendaCalendar";
import AgendaFeed from "./AgendaFeed";
import FocusFrame from "./FocusFrame";
import type { AgendaItem, ProjectCategory } from "@/lib/types";

export default function CalendarWorkspace() {
  const [view, setView] = useState<"month" | "week">("month");
  const [mobileGrid, setMobileGrid] = useState(false);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<AgendaItem | null>(null);
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
  item: AgendaItem;
  onClose: () => void;
}) {
  return (
    <div className="border border-line bg-canvas p-3 space-y-1">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-heading font-semibold text-sm text-ink">
          {item.title}
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="text-xs font-body text-ink-muted"
        >
          Close
        </button>
      </div>
      <p className="text-xs font-body text-ink-muted">
        {new Date(item.date).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })}
        <span className="mx-1.5">·</span>
        {item.body}
      </p>
      {item.description && (
        <p className="text-sm font-body text-forest-600 leading-relaxed">
          {item.description}
        </p>
      )}
      {item.source_url && (
        <a
          href={item.source_url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs underline text-forest-600"
        >
          View source ↗
        </a>
      )}
    </div>
  );
}
