import type { CalendarItem } from "./calendar-items";

export const CARD_RAIL_PX = 360;
export const WEEK_COL_MIN_PX = 120;
export const EVENT_LINE_PX = 16;
/** Floor so two event lines stay readable. Do not drop this to avoid scroll. */
export const CELL_MIN_PX = 112;

export function gridRowTemplate(rowCount: number): string {
  return `repeat(${Math.max(rowCount, 1)}, minmax(${CELL_MIN_PX}px, 1fr))`;
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

export function isMeetingItem(
  item: Pick<CalendarItem, "kind" | "event_type">
): boolean {
  return item.kind === "agenda" || item.event_type === "meeting";
}

export function closedKindChip(
  item: Pick<CalendarItem, "kind" | "event_type">
): "Meeting" | null {
  return isMeetingItem(item) ? "Meeting" : null;
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
