export const PACIFIC_TZ = "America/Los_Angeles";

const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isDayKey(value: string): boolean {
  return DAY_KEY_RE.test(value);
}

export function dayKeyInPacific(iso: string, timeZone = PACIFIC_TZ): string {
  if (isDayKey(iso)) return iso;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    const prefix = iso.slice(0, 10);
    return isDayKey(prefix) ? prefix : iso;
  }
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function todayKeyPacific(now: Date = new Date()): string {
  return dayKeyInPacific(now.toISOString());
}

/** UTC instant for midnight on `dayKey` in America/Los_Angeles. */
export function ptBoundIso(dayKey: string): string {
  if (!isDayKey(dayKey)) return dayKey;
  for (const offset of ["-07:00", "-08:00"] as const) {
    const candidate = new Date(`${dayKey}T00:00:00${offset}`);
    if (Number.isNaN(candidate.getTime())) continue;
    if (dayKeyInPacific(candidate.toISOString()) !== dayKey) continue;
    const hour = new Intl.DateTimeFormat("en-US", {
      timeZone: PACIFIC_TZ,
      hour: "2-digit",
      hourCycle: "h23",
    }).format(candidate);
    if (hour === "00") return candidate.toISOString();
  }
  return `${dayKey}T08:00:00.000Z`;
}

/** Today through the following 6 civil days. `until` is exclusive. */
export function upcomingWindow(todayKey: string): { since: string; until: string } {
  return {
    since: todayKey,
    until: shiftDayKey(todayKey, 7),
  };
}

export function monthStartKey(month: Date): string {
  const y = month.getFullYear();
  const m = String(month.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01`;
}

/** Civil month window. `until` is exclusive (first of the next month). */
export function monthWindow(month: Date): { since: string; until: string } {
  const since = monthStartKey(month);
  const next = new Date(month.getFullYear(), month.getMonth() + 1, 1);
  return { since, until: monthStartKey(next) };
}

export function shiftMonth(month: Date, delta: number): Date {
  return new Date(month.getFullYear(), month.getMonth() + delta, 1);
}

export function monthContainsDay(month: Date, dayKey: string): boolean {
  const { since, until } = monthWindow(month);
  return dayKey >= since && dayKey < until;
}

export function formatMonthTitle(month: Date): string {
  return month.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export function formatMonthName(month: Date): string {
  return month.toLocaleDateString("en-US", { month: "long" });
}

export function shiftDayKey(dayKey: string, days: number): string {
  if (!isDayKey(dayKey)) return dayKey;
  const [year, month, day] = dayKey.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return next.toISOString().slice(0, 10);
}

export function formatTimePacific(iso: string): string | null {
  if (isDayKey(iso)) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString("en-US", {
    timeZone: PACIFIC_TZ,
    hour: "numeric",
    minute: "2-digit",
  });
}

export function isProjectedEvent(event: {
  description?: string | null;
  body?: string | null;
}): boolean {
  const text = `${event.description ?? ""}\n${event.body ?? ""}`;
  return /RECURRING_PROJECTION/i.test(text) || /confidence\s*=\s*medium/i.test(text);
}

const SCRAPE_BRACKET_RE =
  /\[[^\]]*(?:RECURRING_PROJECTION|[A-Z_]*FROM_CITY_CALENDAR|confidence\s*[=-]\s*[\w-]+)[^\]]*\]/gi;
const SCRAPE_TOKEN_RE =
  /(?:RECURRING_PROJECTION|[A-Z_]*FROM_CITY_CALENDAR|confidence\s*[=-]\s*[\w-]+)/gi;

/** Strip scrape metadata. Never invent a time, place, or name. */
export function displayEventDescription(description: string | null): string | null {
  if (!description) return null;
  const cleaned = description
    .replace(SCRAPE_BRACKET_RE, "")
    .replace(SCRAPE_TOKEN_RE, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.,;:])/g, "$1")
    .trim();
  return cleaned || null;
}
