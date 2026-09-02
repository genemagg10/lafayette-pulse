"use client";

import { CATEGORIES } from "@/lib/categories";
import {
  EVENT_TYPE_STYLES,
  calendarAccent,
  type CalendarItem,
} from "@/lib/calendar-items";

interface CalendarItemCardProps {
  item: CalendarItem;
  selected?: boolean;
  compact?: boolean;
  onSelect?: (item: CalendarItem) => void;
}

export default function CalendarItemCard({
  item,
  selected = false,
  compact = false,
  onSelect,
}: CalendarItemCardProps) {
  const cat = item.category ? CATEGORIES[item.category] : null;
  const eventStyle = item.event_type ? EVENT_TYPE_STYLES[item.event_type] : null;
  const accent = item.kind === "agenda" && cat ? cat.color : calendarAccent(item);
  const kindLabel =
    item.kind === "agenda" ? "Meeting" : eventStyle?.label ?? "Event";

  const dateLabel = new Date(`${item.dayKey}T12:00:00`).toLocaleDateString(
    "en-US",
    {
      month: "short",
      day: "numeric",
      year: "numeric",
    }
  );

  return (
    <div
      role={onSelect ? "button" : undefined}
      tabIndex={onSelect ? 0 : undefined}
      onClick={onSelect ? () => onSelect(item) : undefined}
      onKeyDown={
        onSelect
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect(item);
              }
            }
          : undefined
      }
      className={`bg-surface border border-line ${compact ? "p-3 rounded-lg" : "p-4"} ${
        onSelect ? "cursor-pointer hover:border-forest-300" : ""
      } ${selected ? "ring-1 ring-forest-400" : ""}`}
      style={{
        borderLeftWidth: "3px",
        borderLeftColor: accent,
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-body text-forest-400">
            <span className="uppercase tracking-wide text-forest-400 text-xs">
              {kindLabel}{" "}
            </span>
            <span className="font-semibold text-forest-700 text-sm">
              {dateLabel}
            </span>
            {item.timeLabel && (
              <>
                <span className="mx-1.5">&middot;</span>
                <span className="text-forest-600">{item.timeLabel} PT</span>
              </>
            )}
            {item.body && (
              <>
                <span className="mx-1.5">&middot;</span>
                {item.body}
              </>
            )}
          </p>
          <h4 className="font-heading font-semibold text-ink text-sm mt-1">
            {item.title}
          </h4>
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          {item.projected && (
            <span className="text-[10px] uppercase tracking-wide font-body px-2 py-0.5 rounded-full bg-surface-muted text-ink-muted">
              Projected
            </span>
          )}
          {item.kind === "agenda" && cat && (
            <span
              className="text-xs font-body px-2 py-0.5 rounded-full"
              style={{
                backgroundColor: `${cat.color}20`,
                color: cat.color,
              }}
            >
              {cat.icon} {cat.label}
            </span>
          )}
          {item.kind === "event" && eventStyle && (
            <span
              className="text-[10px] uppercase tracking-wide font-body px-2 py-0.5 rounded-full"
              style={{
                backgroundColor: `${eventStyle.color}18`,
                color: eventStyle.color,
              }}
            >
              {eventStyle.label}
            </span>
          )}
        </div>
      </div>

      {item.location_name && (
        <p className="text-xs font-body text-ink-muted mt-1">{item.location_name}</p>
      )}

      {item.description && (
        <p className="text-forest-600 text-sm font-body mt-2 leading-relaxed">
          {item.description}
        </p>
      )}

      <div className="flex items-center gap-2 mt-2 flex-wrap">
        {item.tags.map((tag) => (
          <span
            key={tag}
            className="bg-surface-muted text-ink-muted text-xs px-2 py-0.5 rounded-full font-body"
          >
            {tag}
          </span>
        ))}
        {item.source_url && (
          <a
            href={item.source_url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(event) => event.stopPropagation()}
            className="text-xs font-body text-forest-600 underline hover:text-ink"
          >
            View Source ↗
          </a>
        )}
      </div>
    </div>
  );
}
