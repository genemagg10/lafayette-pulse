"use client";

import Link from "next/link";
import { calendarCategoryToken } from "@/lib/calendar-layout";
import type { CalendarItem } from "@/lib/calendar-items";
import CancelledBadge from "./CancelledBadge";

interface CalendarItemCardProps {
  item: CalendarItem;
  open?: boolean;
  onToggle?: (item: CalendarItem) => void;
}

export default function CalendarItemCard({
  item,
  open = false,
  onToggle,
}: CalendarItemCardProps) {
  const category = calendarCategoryToken(item);
  const notes = item.description?.trim() || null;

  return (
    <div
      role={onToggle ? "button" : undefined}
      tabIndex={onToggle ? 0 : undefined}
      onClick={onToggle ? () => onToggle(item) : undefined}
      onKeyDown={
        onToggle
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onToggle(item);
              }
            }
          : undefined
      }
      className={`border border-line p-3 text-left ${
        item.cancelled ? "bg-canvas" : "bg-surface"
      } ${onToggle ? "cursor-pointer hover:border-line-strong" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <h3
          className={`font-heading text-[14px] font-semibold leading-snug min-w-0 ${
            item.cancelled ? "text-ink-muted" : "text-ink"
          }`}
        >
          {item.title}
        </h3>
        <span
          className="flex-shrink-0 text-[12px] leading-[12px] font-body text-ink"
          style={{
            backgroundColor: category.color,
            padding: "2px 6px",
            borderRadius: 4,
          }}
        >
          {category.label}
        </span>
      </div>

      {item.timeLabel || item.cancelled ? (
        <p
          className={`text-[12px] font-body tabular-nums mt-1 flex flex-wrap items-center gap-2 ${
            item.cancelled ? "text-ink-muted" : "text-ink"
          }`}
        >
          {item.timeLabel ? (
            <span className={item.cancelled ? "line-through" : undefined}>
              {item.timeLabel}
            </span>
          ) : null}
          {item.cancelled ? <CancelledBadge /> : null}
        </p>
      ) : null}

      {item.location_name ? (
        <p className="text-[12px] font-body text-ink-muted mt-0.5">
          {item.location_name}
        </p>
      ) : null}

      {item.body ? (
        <div className="mt-2 flex flex-wrap gap-1">
          <WhoChip item={item} linkable={open} />
        </div>
      ) : null}

      {open ? (
        <div className="mt-3 space-y-2">
          {notes ? (
            <p className="text-sm font-body text-forest-600 leading-relaxed">
              {notes}
            </p>
          ) : null}
          {item.source_url ? (
            <a
              href={item.source_url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(event) => event.stopPropagation()}
              className="inline-block text-[12px] font-body text-forest-600 underline hover:text-ink"
            >
              Source
            </a>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function WhoChip({
  item,
  linkable,
}: {
  item: CalendarItem;
  linkable: boolean;
}) {
  if (!item.body) return null;
  const className =
    "inline-block text-[12px] font-body text-ink px-2 py-0.5 bg-surface-muted";
  if (linkable && item.organization_id) {
    return (
      <Link
        href={`/who?tab=orgs&org=${item.organization_id}`}
        onClick={(event) => event.stopPropagation()}
        className={className}
      >
        {item.body}
      </Link>
    );
  }
  return <span className={className}>{item.body}</span>;
}
