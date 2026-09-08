import assert from "node:assert/strict";
import { test } from "node:test";
import {
  dayKeyInPacific,
  displayEventDescription,
  formatTimePacific,
  isProjectedEvent,
  ptBoundIso,
  todayKeyPacific,
  upcomingWindow,
} from "../lib/calendar-time.ts";
import {
  CELL_MIN_PX,
  cellVisibleCount,
  closedKindChip,
  eventLineText,
  gridRowTemplate,
  weekRailStacks,
} from "../lib/calendar-layout.ts";

test("late-evening UTC stays on the Pacific civil day", () => {
  // 2026-09-09 02:00 UTC = 2026-09-08 19:00 PDT
  assert.equal(dayKeyInPacific("2026-09-09T02:00:00.000Z"), "2026-09-08");
});

test("after-midnight UTC stays on the same Pacific evening", () => {
  // 2026-11-03 06:30 UTC = 2026-11-02 22:30 PST
  assert.equal(dayKeyInPacific("2026-11-03T06:30:00.000Z"), "2026-11-02");
});

test("date-only agenda strings are not shifted through UTC", () => {
  assert.equal(dayKeyInPacific("2026-09-15"), "2026-09-15");
});

test("ptBoundIso is midnight Pacific for PDT and PST dates", () => {
  const sept = new Date(ptBoundIso("2026-09-01"));
  assert.equal(dayKeyInPacific(sept.toISOString()), "2026-09-01");
  assert.equal(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles",
      hour: "2-digit",
      hourCycle: "h23",
    }).format(sept),
    "00"
  );

  const dec = new Date(ptBoundIso("2026-12-01"));
  assert.equal(dayKeyInPacific(dec.toISOString()), "2026-12-01");
  assert.equal(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles",
      hour: "2-digit",
      hourCycle: "h23",
    }).format(dec),
    "00"
  );
});

test("todayKeyPacific matches Intl Pacific day", () => {
  const now = new Date("2026-09-02T07:30:00.000Z"); // 2026-09-02 00:30 PDT
  assert.equal(todayKeyPacific(now), "2026-09-02");
  const stillMonday = new Date("2026-09-01T07:30:00.000Z"); // 2026-09-01 00:30 PDT
  assert.equal(todayKeyPacific(stillMonday), "2026-09-01");
});

test("projected meetings are labeled from description markers", () => {
  assert.equal(
    isProjectedEvent({
      description: "Regular session. RECURRING_PROJECTION from city calendar.",
      body: "City Council",
    }),
    true
  );
  assert.equal(
    isProjectedEvent({
      description: "Tentative until Granicus confirms (confidence=medium).",
      body: null,
    }),
    true
  );
  assert.equal(
    isProjectedEvent({
      description: "Posted agenda for the September 14 meeting.",
      body: "City Council",
    }),
    false
  );
});

test("projection markers are stripped from displayed description", () => {
  assert.equal(
    displayEventDescription(
      "Projected from official recurring schedule for Public Art Committee. [confidence=medium; Typically 1st Wednesday 4pm; RECURRING_PROJECTION — verify against lovelafayette.org calendar before treating as confirmed]"
    ),
    "Projected from official recurring schedule for Public Art Committee."
  );
  assert.equal(
    displayEventDescription("City Council. RECURRING_PROJECTION from schedule."),
    "City Council. from schedule."
  );
  assert.equal(displayEventDescription("RECURRING_PROJECTION"), null);
  assert.equal(
    displayEventDescription(
      "Regular session. [confidence-high; NEW_FROM_CITY_CALENDAR]"
    ),
    "Regular session."
  );
  assert.equal(displayEventDescription("NEW_FROM_CITY_CALENDAR"), null);
  assert.equal(
    displayEventDescription(
      "Confirmed official listing. [confidence=high; CONFIRMED_FROM_CITY_CALENDAR]"
    ),
    "Confirmed official listing."
  );
});

test("upcoming window is today plus the next 6 days (7 civil days)", () => {
  assert.deepEqual(upcomingWindow("2026-09-08"), {
    since: "2026-09-08",
    until: "2026-09-15",
  });
});

test("cell floor stays 112px so two lines remain readable", () => {
  assert.equal(CELL_MIN_PX, 112);
  assert.equal(gridRowTemplate(6), "repeat(6, minmax(112px, 1fr))");
});

test("week rail stacks when columns would drop under 120px", () => {
  assert.equal(weekRailStacks(1200), false);
  assert.equal(weekRailStacks(1199), true);
  assert.equal(weekRailStacks(1440), false);
});

test("cell lines never reserve a half-cut slot; remainder is N more", () => {
  assert.deepEqual(cellVisibleCount(5, 3), { show: 2, more: 3 });
  assert.deepEqual(cellVisibleCount(2, 3), { show: 2, more: 0 });
  assert.deepEqual(cellVisibleCount(5, 1), { show: 0, more: 5 });
  assert.deepEqual(cellVisibleCount(5, 0), { show: 0, more: 5 });
  assert.deepEqual(cellVisibleCount(1, 1), { show: 1, more: 0 });
});

test("event line uses the recorded time only; kind chip is Meeting or nothing", () => {
  assert.equal(
    eventLineText({ timeLabel: "7:00 PM", title: "City Council" }),
    "7:00 PM City Council"
  );
  assert.equal(
    eventLineText({ timeLabel: null, title: "Capital projects" }),
    "Capital projects"
  );
  assert.equal(
    closedKindChip({ kind: "agenda", event_type: null }),
    "Meeting"
  );
  assert.equal(
    closedKindChip({ kind: "event", event_type: "meeting" }),
    "Meeting"
  );
  assert.equal(
    closedKindChip({ kind: "event", event_type: "community" }),
    null
  );
});

test("evening UTC timestamps keep Pacific clock time", () => {
  assert.equal(formatTimePacific("2026-09-15T02:00:00.000Z"), "7:00 PM");
  assert.equal(formatTimePacific("2026-09-15"), null);
});
