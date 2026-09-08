import type { CalendarItem } from "./calendar-items";
import type { EventType } from "./types";

export const CARD_RAIL_PX = 360;
export const WEEK_COL_MIN_PX = 120;
/** Chip is 12px type + 2px 6px padding (16px). 2px gap so a chip is never cut in half. */
export const EVENT_CHIP_PX = 16;
export const EVENT_CHIP_GAP_PX = 2;
export const EVENT_LINE_PX = EVENT_CHIP_PX + EVENT_CHIP_GAP_PX;

/** Equal fractions of leftover viewport height. Not a fixed cell size. */
export function gridRowTemplate(rowCount: number): string {
  return `repeat(${Math.max(rowCount, 1)}, minmax(0, 1fr))`;
}

export function weekRailStacks(
  containerWidth: number,
  railPx = CARD_RAIL_PX,
  minColPx = WEEK_COL_MIN_PX
): boolean {
  if (containerWidth <= 0) return false;
  return (containerWidth - railPx) / 7 < minColPx;
}

export function cellVisibleCount(
  total: number,
  maxLines: number
): { show: number; more: number } {
  if (total <= 0) return { show: 0, more: 0 };
  if (maxLines <= 0) return { show: 0, more: total };
  if (total <= maxLines) return { show: total, more: 0 };
  if (maxLines === 1) return { show: 0, more: total };
  const show = maxLines - 1;
  return { show, more: total - show };
}

export function eventLineText(item: Pick<CalendarItem, "timeLabel" | "title">): string {
  if (item.timeLabel) return `${item.timeLabel} ${item.title}`;
  return item.title;
}

export function eventChipText(item: { title: string }): string {
  return item.title;
}

export type CalendarCategoryKey = "meeting" | "commission" | "civic" | "other";

export interface CalendarCategoryToken {
  key: CalendarCategoryKey;
  label: string;
  color: string;
}

/** Locked washes. Same category, same color. Never hash a title into a hue. */
export const CALENDAR_CATEGORY_TOKENS: Record<
  CalendarCategoryKey,
  CalendarCategoryToken
> = {
  meeting: { key: "meeting", label: "Meeting", color: "#E4EDE8" },
  commission: { key: "commission", label: "Commission", color: "#E7EEF4" },
  civic: { key: "civic", label: "Civic event", color: "#F6E6D4" },
  other: { key: "other", label: "Other", color: "#F0EEE8" },
};

const CITY_COUNCIL_RE = /\bcity council\b/i;
const COMMISSION_RE = /\bcommissions?\b/i;

type CategorySource = {
  kind?: "agenda" | "event";
  event_type?: EventType | null;
  title?: string | null;
  body?: string | null;
};

function namesCommission(...parts: Array<string | null | undefined>): boolean {
  return COMMISSION_RE.test(parts.filter(Boolean).join(" "));
}

function namesCityCouncil(...parts: Array<string | null | undefined>): boolean {
  return CITY_COUNCIL_RE.test(parts.filter(Boolean).join(" "));
}

/**
 * Map an existing event kind onto the four locked tokens.
 * Sitting meetings (City Council and commission meetings) are Meeting.
 * Named commissions that are not the sitting meeting are Commission.
 */
export function calendarCategoryKey(item: CategorySource): CalendarCategoryKey {
  if (item.event_type === "meeting") return "meeting";
  if (item.event_type === "community") return "civic";
  if (item.event_type === "election") return "civic";
  if (item.event_type === "deadline") return "other";

  if (namesCommission(item.title, item.body)) return "commission";
  if (namesCityCouncil(item.title, item.body)) return "meeting";
  return "other";
}

export function calendarCategoryToken(item: CategorySource): CalendarCategoryToken {
  return CALENDAR_CATEGORY_TOKENS[calendarCategoryKey(item)];
}

export function isMeetingItem(
  item: Pick<CalendarItem, "kind" | "event_type">
): boolean {
  return item.kind === "agenda" || item.event_type === "meeting";
}

export function closedKindChip(
  item: Pick<CalendarItem, "kind" | "event_type" | "title" | "body">
): string {
  return calendarCategoryToken(item).label;
}

export function meetingKindRule(item: Pick<CalendarItem, "kind" | "event_type">): string {
  return isMeetingItem(item) ? "var(--forest)" : "var(--line-strong)";
}

export function monthGridRows(startOffset: number, daysInMonth: number): number {
  return Math.ceil((startOffset + daysInMonth) / 7);
}

export function monthTrailingEmpties(startOffset: number, daysInMonth: number): number {
  const remainder = (startOffset + daysInMonth) % 7;
  return remainder === 0 ? 0 : 7 - remainder;
}

export function formatRailDay(dayKey: string): string {
  return new Date(`${dayKey}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export function formatGroupDay(dayKey: string): string {
  return new Date(`${dayKey}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}
