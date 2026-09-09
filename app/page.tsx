"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import lafayetteMark from "../public/lafayette-emblem.png";
import BackendBanner from "./components/BackendBanner";
import BoardRedirect from "./components/BoardRedirect";
import PulseHomeMap from "./components/PulseHomeMap";
import { useHealth } from "@/lib/use-health";
import {
  fetchCalendarItems,
  todayKeyPacific,
  type CalendarItem,
} from "@/lib/calendar-items";

function countLabel(n: number | null | undefined, unavailable?: boolean): string {
  if (unavailable) return "—";
  if (n == null) return "—";
  return String(n);
}

function meetingWhen(item: CalendarItem): string {
  const date = new Date(`${item.dayKey}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  if (item.timeLabel) {
    return `${date} · ${item.timeLabel} PT`;
  }
  return date;
}

export default function Home() {
  const { health, freshness, backendDown } = useHealth();
  const [upcoming, setUpcoming] = useState<CalendarItem[]>([]);
  const [upcomingError, setUpcomingError] = useState<string | null>(null);

  useEffect(() => {
    const today = todayKeyPacific();
    fetchCalendarItems({
      since: today,
      upcoming: true,
      limit: 8,
      preferEvents: true,
    })
      .then(setUpcoming)
      .catch((err) => {
        setUpcoming([]);
        setUpcomingError(err instanceof Error ? err.message : "Unavailable");
      });
  }, []);

  const unavailable = freshness.unavailable;
  const people = health?.counts.people ?? null;
  const orgs = health?.counts.organizations ?? null;
  const candidates = health?.counts.candidacies ?? null;
  const measures = health?.counts.measures ?? null;

  const counts = [
    { label: "People", value: people, href: "/who?tab=people", mark: "oak" },
    { label: "Organizations", value: orgs, href: "/who?tab=orgs", mark: "gold" },
    { label: "Measures", value: measures, href: "/who?tab=measures", mark: "ink" },
    { label: "Candidates", value: candidates, href: "/who?tab=candidates", mark: "ridge" },
  ] as const;

  return (
    <div className="bg-canvas min-h-dvh">
      <BoardRedirect />

      <header className="pulse-home-ridge">
        <div className="pulse-home-ridge__scene" aria-hidden="true">
          <div className="pulse-home-ridge__align max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <img
              src="/pulse-ridge.svg?v=lock-2"
              alt=""
              width={2600}
              height={108}
              className="pulse-home-ridge__sil"
            />
          </div>
        </div>
        <div className="pulse-home-ridge__wash" aria-hidden="true" />
        <div className="relative z-10 h-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <Image
              src={lafayetteMark}
              alt=""
              priority
              height={28}
              width={32}
              className="flex-shrink-0"
            />
            <h1 className="font-heading text-xl sm:text-2xl lg:text-3xl font-bold text-ink tracking-tight whitespace-nowrap">
              Lafayette Pulse
            </h1>
          </div>
          <p className="flex-shrink min-w-0 text-[11px] sm:text-sm font-body text-ink-muted text-right leading-snug">
            {freshness.label}
          </p>
        </div>
      </header>

      <div className="max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pb-10">
        {backendDown && (
          <div className="mb-4">
            <BackendBanner />
          </div>
        )}

        <section aria-label="Counts" className="border-y border-line">
          <div className="grid grid-cols-4 divide-x divide-line">
            {counts.map((item) => (
              <CountCell
                key={item.label}
                href={item.href}
                label={item.label}
                value={countLabel(item.value, unavailable)}
                mark={item.mark}
              />
            ))}
          </div>
        </section>

        <section className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start">
          <Link
            href="/map"
            aria-label="Open map"
            className="relative block h-[min(52vh,520px)] min-h-[300px] overflow-hidden rounded-md bg-canvas"
          >
            <div className="absolute inset-0 pointer-events-none">
              <PulseHomeMap />
            </div>
            <span className="absolute bottom-3 right-3 z-10 rounded-md bg-surface border border-line px-3 py-1.5 text-xs font-body text-ink">
              Open map
            </span>
          </Link>

          <aside className="lg:w-[300px]">
            <h2 className="font-heading font-bold text-ink text-xl">Coming up</h2>
            {upcomingError ? (
              <p className="mt-3 text-sm font-body text-ink-muted">
                Upcoming meetings are temporarily unavailable.
              </p>
            ) : upcoming.length === 0 ? (
              <p className="mt-3 text-sm font-body text-ink-muted">
                No upcoming meetings in the current feed.
              </p>
            ) : (
              <ul className="mt-2 divide-y divide-line">
                {upcoming.slice(0, 6).map((item) => (
                  <li key={item.id}>
                    <Link href="/calendar" className="block py-3 hover:bg-canvas">
                      <p className="text-xs font-body text-ink-muted">
                        {meetingWhen(item)}
                      </p>
                      <p className="font-heading font-semibold text-ink mt-0.5">
                        {item.title}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </aside>
        </section>
      </div>
    </div>
  );
}

function CountCell({
  href,
  label,
  value,
  mark,
}: {
  href: string;
  label: string;
  value: string;
  mark: "oak" | "gold" | "ridge" | "ink";
}) {
  const markClass = {
    oak: "bg-oak",
    gold: "bg-gold",
    ridge: "bg-ridge",
    ink: "bg-ink",
  }[mark];

  return (
    <Link href={href} className="px-3 sm:px-5 py-3.5 hover:bg-surface/60">
      <span className={`block w-8 h-[3px] mb-2 ${markClass}`} aria-hidden="true" />
      <p className="text-[10px] sm:text-[11px] font-body font-semibold uppercase tracking-wider text-ink">
        {label}
      </p>
      <p className="font-heading text-2xl sm:text-3xl font-bold text-ink mt-1 tabular-nums">
        {value}
      </p>
    </Link>
  );
}
