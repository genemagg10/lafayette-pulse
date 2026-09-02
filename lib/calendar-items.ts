import { migrateCategory } from "./categories";
import {
  dayKeyInPacific,
  displayEventDescription,
  formatTimePacific,
  isDayKey,
  isProjectedEvent,
  ptBoundIso,
} from "./calendar-time";
import type { AgendaItem, CivicEvent, EventType, ProjectCategory } from "./types";

export {
  PACIFIC_TZ,
  dayKeyInPacific,
  displayEventDescription,
  formatTimePacific,
  isDayKey,
  isProjectedEvent,
  ptBoundIso,
  shiftDayKey,
  todayKeyPacific,
} from "./calendar-time";

export type CalendarItemKind = "agenda" | "event";

export interface CalendarItem {
  id: string;
  kind: CalendarItemKind;
  title: string;
  body: string | null;
  description: string | null;
  /** Original timestamp or date string used for sorting. */
  occursAt: string;
  /** Civil date YYYY-MM-DD in America/Los_Angeles. */
  dayKey: string;
  timeLabel: string | null;
  location_name: string | null;
  source_url: string | null;
  category: ProjectCategory | null;
  tags: string[];
  event_type: EventType | null;
  projected: boolean;
}

export const EVENT_TYPE_STYLES: Record<
  EventType,
  { label: string; color: string }
> = {
  meeting: { label: "Meeting", color: "#3d6b5a" },
  community: { label: "Community", color: "#8A7A4B" },
  election: { label: "Election", color: "#0072B2" },
  deadline: { label: "Deadline", color: "#5a675f" },
  other: { label: "Event", color: "#8a938c" },
};

export function calendarAccent(item: CalendarItem): string {
  if (item.kind === "event" && item.event_type) {
    return EVENT_TYPE_STYLES[item.event_type].color;
  }
  return "#DDDDD0";
}

export function agendaToCalendarItem(item: AgendaItem): CalendarItem {
  const date = item.date ?? "";
  const dayKey = dayKeyInPacific(date);
  return {
    id: `agenda:${item.id}`,
    kind: "agenda",
    title: item.title,
    body: item.body ?? null,
    description: item.description ?? null,
    occursAt: date,
    dayKey,
    timeLabel: formatTimePacific(date),
    location_name: null,
    source_url: item.source_url ?? null,
    category: item.category ? migrateCategory(item.category) : null,
    tags: Array.isArray(item.tags) ? item.tags : [],
    event_type: null,
    projected: false,
  };
}

export function eventToCalendarItem(event: CivicEvent): CalendarItem {
  return {
    id: `event:${event.id}`,
    kind: "event",
    title: event.title,
    body: event.body ?? null,
    description: displayEventDescription(event.description),
    occursAt: event.starts_at,
    dayKey: dayKeyInPacific(event.starts_at),
    timeLabel: formatTimePacific(event.starts_at),
    location_name: event.location_name ?? null,
    source_url: event.source_url ?? null,
    category: event.category ? migrateCategory(event.category) : null,
    tags: [],
    event_type: event.event_type ?? "other",
    projected: isProjectedEvent(event),
  };
}

export function inDayWindow(
  item: CalendarItem,
  since?: string | null,
  until?: string | null
): boolean {
  if (since && item.dayKey < since) return false;
  if (until && item.dayKey >= until) return false;
  return true;
}

function occursValue(item: CalendarItem): number {
  if (isDayKey(item.occursAt)) {
    return new Date(ptBoundIso(item.occursAt)).getTime();
  }
  const time = new Date(item.occursAt).getTime();
  return Number.isNaN(time) ? 0 : time;
}

export function sortCalendarItems(
  items: CalendarItem[],
  ascending: boolean
): CalendarItem[] {
  return [...items].sort((a, b) => {
    const delta = occursValue(a) - occursValue(b);
    if (delta !== 0) return ascending ? delta : -delta;
    return a.title.localeCompare(b.title);
  });
}

export function mergeCalendarItems(
  agenda: AgendaItem[],
  events: CivicEvent[],
  options: { since?: string | null; until?: string | null; ascending?: boolean } = {}
): CalendarItem[] {
  const { since, until, ascending = true } = options;
  const merged = [
    ...agenda.map(agendaToCalendarItem),
    ...events.map(eventToCalendarItem),
  ].filter((item) => inDayWindow(item, since, until));
  return sortCalendarItems(merged, ascending);
}

function asList<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  return [];
}

export interface CalendarQuery {
  since?: string;
  until?: string;
  upcoming?: boolean;
  category?: string;
  limit?: number;
  /** Home hub: use events when any exist; otherwise agenda_items. */
  preferEvents?: boolean;
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url);
  return res.json().catch(() => []);
}

export async function fetchCalendarItems(
  query: CalendarQuery
): Promise<CalendarItem[]> {
  const params = new URLSearchParams();
  const pageLimit = query.limit ?? 100;
  params.set("limit", String(pageLimit));
  if (query.upcoming) params.set("upcoming", "true");
  if (query.category) params.set("category", query.category);

  const eventParams = new URLSearchParams(params);
  if (query.since) eventParams.set("since", query.since);
  if (query.until) eventParams.set("until", query.until);

  const agendaParams = new URLSearchParams(params);
  if (query.since) agendaParams.set("since", query.since);
  if (query.until) agendaParams.set("until", query.until);

  const [eventData, agendaData] = await Promise.all([
    fetchJson(`/api/events?${eventParams}`),
    fetchJson(`/api/agenda-items?${agendaParams}`),
  ]);

  const events = asList<CivicEvent>(eventData);
  const agenda = asList<AgendaItem>(agendaData);
  const ascending = Boolean(query.upcoming) || !query.until;

  const applyCategory = (items: CalendarItem[]): CalendarItem[] => {
    if (!query.category) return items;
    const cats = query.category.split(",").map((c) => c.trim()).filter(Boolean);
    if (cats.length === 0) return items;
    return items.filter((item) => item.category != null && cats.includes(item.category));
  };

  if (query.preferEvents) {
    const eventItems = applyCategory(
      mergeCalendarItems([], events, {
        since: query.since,
        until: query.until,
        ascending,
      })
    );
    if (eventItems.length > 0) return eventItems.slice(0, pageLimit);
    return applyCategory(
      mergeCalendarItems(agenda, [], {
        since: query.since,
        until: query.until,
        ascending,
      })
    ).slice(0, pageLimit);
  }

  return applyCategory(
    mergeCalendarItems(agenda, events, {
      since: query.since,
      until: query.until,
      ascending,
    })
  ).slice(0, pageLimit);
}
