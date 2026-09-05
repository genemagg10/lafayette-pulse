import { NextResponse } from "next/server";
import type { PostgrestError } from "@supabase/supabase-js";
import { tryGetSupabase } from "@/lib/supabase";
import type { HealthCounts, HealthResponse } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function emptyHealth(): HealthResponse {
  return {
    ok: false,
    supabase_reachable: false,
    counts: {
      projects: null,
      agenda_items: null,
      events: null,
      document_chunks: null,
      people: null,
      organizations: null,
      memberships: null,
      seat_holders: null,
      measures: null,
      stances: null,
      candidacies: null,
    },
    last_scraped_at: null,
    checked_at: new Date().toISOString(),
  };
}

function isMissingRelation(error: PostgrestError | null): boolean {
  if (!error) return false;
  const message = (error.message || "").toLowerCase();
  const code = error.code || "";
  return (
    code === "PGRST205" ||
    code === "42P01" ||
    message.includes("schema cache") ||
    message.includes("does not exist") ||
    message.includes("could not find the table")
  );
}

function isUnreachableError(error: PostgrestError | null): boolean {
  if (!error) return false;
  if (isMissingRelation(error)) return false;
  const message = (error.message || "").toLowerCase();
  const code = error.code || "";
  return (
    message.includes("fetch failed") ||
    message.includes("failed to fetch") ||
    message.includes("network") ||
    message.includes("enotfound") ||
    message.includes("econnrefused") ||
    message.includes("jwt") ||
    message.includes("invalid api key") ||
    message.includes("api key") ||
    message.includes("supabaseurl is required") ||
    code === "PGRST301" ||
    code === "401" ||
    code === "403"
  );
}

async function countTable(
  table: keyof HealthCounts
): Promise<{ count: number | null; reachable: boolean }> {
  const supabase = tryGetSupabase();
  if (!supabase) return { count: null, reachable: false };
  try {
    const { count, error } = await supabase
      .from(table)
      .select("*", { count: "exact", head: true });
    if (!error) return { count: count ?? 0, reachable: true };
    if (isMissingRelation(error)) return { count: null, reachable: true };
    if (isUnreachableError(error)) return { count: null, reachable: false };
    // Unknown query error: treat as reachable (PostgREST answered) but no count
    return { count: null, reachable: true };
  } catch {
    return { count: null, reachable: false };
  }
}

async function latestScrapedAt(): Promise<{
  last_scraped_at: string | null;
  reachable: boolean;
}> {
  const supabase = tryGetSupabase();
  if (!supabase) return { last_scraped_at: null, reachable: false };
  try {
    const { data, error } = await supabase
      .from("scraped_sources")
      .select("scraped_at")
      .order("scraped_at", { ascending: false })
      .limit(1);
    if (!error) {
      const row = Array.isArray(data) ? data[0] : null;
      return {
        last_scraped_at: row?.scraped_at ?? null,
        reachable: true,
      };
    }
    if (isMissingRelation(error)) {
      return { last_scraped_at: null, reachable: true };
    }
    if (isUnreachableError(error)) {
      return { last_scraped_at: null, reachable: false };
    }
    return { last_scraped_at: null, reachable: true };
  } catch {
    return { last_scraped_at: null, reachable: false };
  }
}

export async function GET() {
  const payload = emptyHealth();

  try {
    const supabase = tryGetSupabase();
    if (!supabase) {
      return NextResponse.json(payload, {
        status: 200,
        headers: { "Cache-Control": "no-store" },
      });
    }

    const [projects, agendaItems, events, documentChunks, people, organizations, memberships, seatHolders, measures, stances, candidacies, scraped] =
      await Promise.all([
        countTable("projects"),
        countTable("agenda_items"),
        countTable("events"),
        countTable("document_chunks"),
        countTable("people"),
        countTable("organizations"),
        countTable("memberships"),
        countTable("seat_holders"),
        countTable("measures"),
        countTable("stances"),
        countTable("candidacies"),
        latestScrapedAt(),
      ]);

    const reachable =
      projects.reachable ||
      agendaItems.reachable ||
      events.reachable ||
      documentChunks.reachable ||
      people.reachable ||
      organizations.reachable ||
      memberships.reachable ||
      seatHolders.reachable ||
      measures.reachable ||
      stances.reachable ||
      candidacies.reachable ||
      scraped.reachable;

    payload.supabase_reachable = reachable;
    payload.ok = reachable;
    payload.counts.projects = projects.count;
    payload.counts.agenda_items = agendaItems.count;
    payload.counts.events = events.count;
    payload.counts.document_chunks = documentChunks.count;
    payload.counts.people = people.count;
    payload.counts.organizations = organizations.count;
    payload.counts.memberships = memberships.count;
    payload.counts.seat_holders = seatHolders.count;
    payload.counts.measures = measures.count;
    payload.counts.stances = stances.count;
    payload.counts.candidacies = candidacies.count;
    payload.last_scraped_at = scraped.last_scraped_at;
    payload.checked_at = new Date().toISOString();

    return NextResponse.json(payload, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json(emptyHealth(), {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
