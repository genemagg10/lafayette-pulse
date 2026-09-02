"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import BackendBanner from "./components/BackendBanner";
import BoardRedirect from "./components/BoardRedirect";
import { useHealth } from "@/lib/use-health";
import type { AgendaItem } from "@/lib/types";
import type { MeasureListItem } from "@/lib/stances";

function countLabel(n: number | null | undefined, unavailable?: boolean): string {
  if (unavailable) return "—";
  if (n == null) return "—";
  return String(n);
}

export default function Home() {
  const { health, freshness, backendDown } = useHealth();
  const [upcoming, setUpcoming] = useState<AgendaItem[]>([]);
  const [upcomingError, setUpcomingError] = useState<string | null>(null);
  const [contested, setContested] = useState<number | null>(null);

  useEffect(() => {
    const today = new Date().toISOString().split("T")[0];
    fetch(`/api/agenda-items?since=${today}&upcoming=true&limit=8`)
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
        return Array.isArray(data) ? (data as AgendaItem[]) : [];
      })
      .then(setUpcoming)
      .catch((err) => {
        setUpcoming([]);
        setUpcomingError(err.message);
      });
  }, []);

  useEffect(() => {
    fetch("/api/measures?limit=50&offset=0")
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
        const items: MeasureListItem[] = Array.isArray(data?.items) ? data.items : [];
        setContested(
          items.filter((row) => row.support_count > 0 && row.oppose_count > 0).length
        );
      })
      .catch(() => setContested(null));
  }, []);

  const people = health?.counts.people ?? null;
  const orgs = health?.counts.organizations ?? null;
  const meetings = health?.counts.agenda_items ?? null;
  const unavailable = freshness.unavailable;

  return (
    <div className="max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">
      <BoardRedirect />

      <div>
        <h1 className="font-heading text-2xl sm:text-3xl font-bold text-ink">
          Lafayette Pulse
        </h1>
        <p className="mt-1 text-sm font-body text-forest-600 max-w-2xl">
          Orientation hub for the civic record — who sits where, what is coming
          up, and doorways into the map, calendar, and who&apos;s who. Deep
          graphs live on their own pages.
        </p>
      </div>

      {backendDown && <BackendBanner />}

      <section aria-label="Snapshot">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Kpi
            href="/who?tab=people"
            label="People"
            value={countLabel(people, unavailable)}
          />
          <Kpi
            href="/who?tab=orgs"
            label="Organizations"
            value={countLabel(orgs, unavailable)}
          />
          <Kpi
            href="/calendar"
            label="Upcoming meetings"
            value={countLabel(
              upcomingError ? meetings : upcoming.length || meetings,
              unavailable
            )}
          />
          <Kpi
            href="/who?tab=measures"
            label="Contested measures"
            value={countLabel(contested, unavailable)}
          />
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div className="bg-surface border border-line p-4">
          <div className="flex items-baseline justify-between gap-3 mb-3">
            <h2 className="font-heading font-bold text-ink">Coming up</h2>
            <Link
              href="/calendar"
              className="text-xs font-body text-forest-600 underline hover:text-forest-800"
            >
              Open calendar
            </Link>
          </div>
          {upcomingError ? (
            <p className="text-sm font-body text-forest-500">
              Upcoming meetings are temporarily unavailable.
            </p>
          ) : upcoming.length === 0 ? (
            <p className="text-sm font-body text-forest-500">
              No upcoming meetings in the current feed.
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {upcoming.slice(0, 6).map((item) => (
                <li key={item.id} className="py-2.5">
                  <p className="text-xs font-body text-forest-500">
                    {new Date(item.date).toLocaleDateString("en-US", {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    })}
                    <span className="mx-1.5">·</span>
                    {item.body}
                  </p>
                  <p className="font-heading font-semibold text-sm text-ink mt-0.5">
                    {item.title}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Doorway
            href="/who?tab=people"
            title="Who's who"
            body="People, seats, and overlapping membership."
          />
          <Doorway
            href="/who?tab=orgs"
            title="Orgs & affinity"
            body="Directory plus shared-membership graph."
          />
          <Doorway
            href="/who?tab=measures"
            title="Measures"
            body="Quote-backed support and oppose, including the DEMO-SAFE ribbon."
          />
          <Doorway
            href="/projects"
            title="Project archive"
            body="The older project list, under More — not a primary nav item."
          />
        </div>
      </section>
    </div>
  );
}

function Kpi({
  href,
  label,
  value,
}: {
  href: string;
  label: string;
  value: string;
}) {
  return (
    <Link
      href={href}
      className="bg-surface border border-line p-4 hover:border-accent transition-colors"
    >
      <p className="text-[11px] uppercase tracking-wide font-body text-forest-500">
        {label}
      </p>
      <p className="font-heading text-2xl font-bold text-ink mt-1 tabular-nums">
        {value}
      </p>
    </Link>
  );
}

function Doorway({
  href,
  title,
  body,
}: {
  href: string;
  title: string;
  body: string;
}) {
  return (
    <Link
      href={href}
      className="bg-surface border border-line p-4 hover:border-accent transition-colors flex flex-col"
    >
      <h3 className="font-heading font-bold text-ink">{title}</h3>
      <p className="text-sm font-body text-forest-600 mt-1 flex-1">{body}</p>
      <span className="text-xs font-body text-forest-500 mt-3">Open →</span>
    </Link>
  );
}
