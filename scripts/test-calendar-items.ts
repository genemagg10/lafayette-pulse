import assert from "node:assert/strict";
import { test } from "node:test";
import {
  dayKeyInPacific,
  displayEventDescription,
  formatMonthName,
  formatMonthTitle,
  formatTimePacific,
  isProjectedEvent,
  monthContainsDay,
  monthWindow,
  ptBoundIso,
  shiftMonth,
  todayKeyPacific,
  upcomingWindow,
} from "../lib/calendar-time.ts";
import {
  CALENDAR_CATEGORY_TOKENS,
  EVENT_LINE_PX,
  calendarCategoryKey,
  calendarCategoryToken,
  cellVisibleCount,
  closedKindChip,
  eventChipText,
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

test("week rows are equal 1fr fractions, not a fixed 112px cell", () => {
  assert.equal(gridRowTemplate(6), "repeat(6, minmax(0, 1fr))");
  assert.equal(gridRowTemplate(1), "repeat(1, minmax(0, 1fr))");
  assert.doesNotMatch(gridRowTemplate(6), /112px/);
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

test("event line keeps recorded time; month chips use the event name only", () => {
  assert.equal(
    eventLineText({ timeLabel: "7:00 PM", title: "City Council" }),
    "7:00 PM City Council"
  );
  assert.equal(
    eventChipText({ title: "Art & Wine Festival" }),
    "Art & Wine Festival"
  );
});

test("category tokens are four locked washes and never hash the title", () => {
  const council = calendarCategoryToken({
    kind: "event",
    event_type: "meeting",
    title: "City Council Regular Meeting",
    body: "City Council",
  });
  const planningMeeting = calendarCategoryToken({
    kind: "event",
    event_type: "meeting",
    title: "Planning Commission",
    body: "Planning Commission",
  });
  assert.equal(council.key, "meeting");
  assert.equal(council.color, "#E4EDE8");
  assert.equal(planningMeeting.color, council.color);
  assert.equal(
    calendarCategoryToken({
      kind: "event",
      event_type: "community",
      title: "Art & Wine Festival",
    }).color,
    "#F6E6D4"
  );
  assert.equal(
    calendarCategoryToken({
      kind: "event",
      event_type: "community",
      title: "Ribbon cutting at the library",
    }).color,
    "#F6E6D4"
  );
  assert.equal(
    calendarCategoryKey({
      kind: "agenda",
      event_type: null,
      title: "Design guidelines",
      body: "Planning Commission",
    }),
    "commission"
  );
  assert.equal(
    calendarCategoryToken({
      kind: "agenda",
      event_type: null,
      title: "Design guidelines",
      body: "Planning Commission",
    }).color,
    "#E7EEF4"
  );
  assert.equal(
    calendarCategoryKey({
      kind: "agenda",
      event_type: null,
      title: "Consent calendar",
      body: "City Council",
    }),
    "meeting"
  );
  assert.equal(
    calendarCategoryKey({
      kind: "event",
      event_type: "other",
      title: "Utility notice",
    }),
    "other"
  );
  assert.equal(
    calendarCategoryToken({
      kind: "event",
      event_type: "deadline",
      title: "File papers",
    }).color,
    "#F0EEE8"
  );
  assert.equal(Object.keys(CALENDAR_CATEGORY_TOKENS).length, 4);
  assert.equal(
    closedKindChip({
      kind: "event",
      event_type: "community",
      title: "Farmers market",
      body: null,
    }),
    "Civic event"
  );
  assert.equal(
    closedKindChip({
      kind: "event",
      event_type: "meeting",
      title: "City Council",
      body: "City Council",
    }),
    "Meeting"
  );
});

test("rail month window is the civil month, not a 7-day Upcoming cap", () => {
  const october = new Date(2026, 9, 1);
  assert.deepEqual(monthWindow(october), {
    since: "2026-10-01",
    until: "2026-11-01",
  });
  assert.equal(monthContainsDay(october, "2026-10-15"), true);
  assert.equal(monthContainsDay(october, "2026-09-08"), false);
  assert.equal(formatMonthTitle(october), "October 2026");
  assert.equal(formatMonthName(shiftMonth(october, 1)), "November");
  assert.equal(EVENT_LINE_PX, 18);
});

test("evening UTC timestamps keep Pacific clock time", () => {
  assert.equal(formatTimePacific("2026-09-15T02:00:00.000Z"), "7:00 PM");
  assert.equal(formatTimePacific("2026-09-15"), null);
});
