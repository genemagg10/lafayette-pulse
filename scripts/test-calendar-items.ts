import assert from "node:assert/strict";
import { test } from "node:test";
import {
  dayKeyInPacific,
  displayEventDescription,
  formatTimePacific,
  isProjectedEvent,
  ptBoundIso,
  todayKeyPacific,
} from "../lib/calendar-time.ts";

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
    displayEventDescription("City Council. RECURRING_PROJECTION from schedule."),
    "City Council. from schedule."
  );
  assert.equal(displayEventDescription("RECURRING_PROJECTION"), null);
});

test("evening UTC timestamps keep Pacific clock time", () => {
  assert.equal(formatTimePacific("2026-09-15T02:00:00.000Z"), "7:00 PM");
  assert.equal(formatTimePacific("2026-09-15"), null);
});
