"use client";

import Link from "next/link";
import { useHealth } from "@/lib/use-health";

export default function MorePage() {
  const { health, freshness, loading } = useHealth();

  return (
    <div className="max-w-3xl w-full mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold text-ink">More</h1>
        <p className="text-sm font-body text-forest-600 mt-1">
          Secondary tools. Projects stay here so they do not compete with Pulse,
          Map, Calendar, and Who.
        </p>
      </div>

      <section className="bg-surface border border-line p-4 space-y-2">
        <h2 className="font-heading font-semibold text-ink">Health & freshness</h2>
        <p className="text-sm font-body text-forest-600">
          {loading ? "Checking data…" : freshness.label}
        </p>
        {health && (
          <ul className="text-sm font-body text-forest-700 space-y-1">
            <li>Supabase: {health.supabase_reachable ? "reachable" : "unreachable"}</li>
            <li>People: {health.counts.people ?? "—"}</li>
            <li>Organizations: {health.counts.organizations ?? "—"}</li>
            <li>Measures: {health.counts.measures ?? "—"}</li>
            <li>Stances: {health.counts.stances ?? "—"}</li>
            <li>Projects: {health.counts.projects ?? "—"}</li>
            <li>Events: {health.counts.events ?? "—"}</li>
            <li>Last scrape: {health.last_scraped_at ?? "none"}</li>
          </ul>
        )}
        <a href="/api/health" className="text-xs underline text-forest-600">
          Open /api/health ↗
        </a>
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <Link
          href="/projects"
          className="bg-surface border border-line p-4 hover:border-accent"
        >
          <h2 className="font-heading font-semibold text-ink">Project archive</h2>
          <p className="text-sm font-body text-forest-600 mt-1">
            City projects by category — kept off primary nav.
          </p>
        </Link>
        <Link
          href="/ask"
          className="bg-surface border border-line p-4 hover:border-accent"
        >
          <h2 className="font-heading font-semibold text-ink">Ask Lafayette AI</h2>
          <p className="text-sm font-body text-forest-600 mt-1">
            Chat lives here — not as a floating button on every page.
          </p>
        </Link>
        <Link
          href="/who?tab=measures"
          className="bg-surface border border-line p-4 hover:border-accent"
        >
          <h2 className="font-heading font-semibold text-ink">Measures</h2>
          <p className="text-sm font-body text-forest-600 mt-1">
            Lives under Who, not as a peer nav item.
          </p>
        </Link>
      </section>
    </div>
  );
}
