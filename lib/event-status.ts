import type { EventStatus } from "./types";

/**
 * Missing, null, or any value other than the exact "cancelled" token counts
 * as scheduled. That keeps lists and maps working before the status column
 * exists and after it is backfilled.
 */
export function eventStatus(value: string | null | undefined): EventStatus {
  return value === "cancelled" ? "cancelled" : "scheduled";
}

export function isCancelledEvent(
  event: { status?: string | null } | null | undefined
): boolean {
  return eventStatus(event?.status) === "cancelled";
}

/** Map pins and upcoming-meeting counts. Lists and calendars keep the rows. */
export function omitCancelledEvents<T extends { status?: string | null }>(
  events: readonly T[]
): T[] {
  return events.filter((event) => !isCancelledEvent(event));
}
