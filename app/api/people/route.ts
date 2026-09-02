import { NextRequest } from "next/server";
import {
  jsonNoStore,
  parseLimit,
  parseOffset,
  parseOptionalBool,
} from "@/lib/safe-list";
import { tryGetSupabase } from "@/lib/supabase";
import { sanitizeIlike } from "@/lib/civic-graph";
import {
  loadGraphSnapshot,
  personRoleSummary,
  type PersonRow,
} from "@/lib/civic-graph-data";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  try {
    const supabase = tryGetSupabase();
    if (!supabase) {
      return jsonNoStore({ items: [], total: 0, limit: 50, offset: 0 });
    }

    const qRaw =
      request.nextUrl.searchParams.get("q")?.trim() ||
      request.nextUrl.searchParams.get("search")?.trim() ||
      "";
    const q = qRaw ? sanitizeIlike(qRaw) : "";
    const hasSeat = parseOptionalBool(request, "has_seat");
    const sort =
      request.nextUrl.searchParams.get("sort") === "name" ? "name" : "footprint";
    const limit = parseLimit(request, 50, 100);
    const offset = parseOffset(request);

    let seatedIds: string[] | null = null;
    if (hasSeat !== null) {
      const { data, error } = await supabase.from("seat_holders").select("person_id");
      if (error) return jsonNoStore({ error: error.message }, 500);
      seatedIds = Array.from(new Set((data ?? []).map((row) => row.person_id as string)));
    }

    let query = supabase.from("people").select("*", { count: "exact" });
    if (sort === "name") {
      query = query.order("full_name", { ascending: true });
    }

    if (q) {
      query = query.or(`full_name.ilike.%${q}%,bio.ilike.%${q}%`);
    }
    if (hasSeat === true) {
      if (!seatedIds || seatedIds.length === 0) {
        return jsonNoStore({ items: [], total: 0, limit, offset });
      }
      query = query.in("id", seatedIds);
    } else if (hasSeat === false && seatedIds && seatedIds.length > 0) {
      query = query.not("id", "in", `(${seatedIds.join(",")})`);
    }

    const pageQuery =
      sort === "name" ? query.range(offset, offset + limit - 1) : query;
    const { data, error, count } = await pageQuery;
    if (error) return jsonNoStore({ error: error.message }, 500);

    const people = (data ?? []) as PersonRow[];
    let items: (PersonRow & {
      membership_count?: number;
      seat_count?: number;
    })[] = people;
    if (people.length > 0) {
      const snapshot = await loadGraphSnapshot(supabase);
      const summary = personRoleSummary(
        snapshot,
        people.map((person) => person.id)
      );
      items = people.map((person) => {
        const roles = summary.get(person.id);
        const membership_count = roles?.membership_count ?? 0;
        const seat_count = roles?.seat_count ?? 0;
        return {
          ...person,
          ...roles,
          membership_count,
          seat_count,
          footprint_score: membership_count + seat_count,
        };
      });
    }

    if (sort === "footprint") {
      items.sort((a, b) => {
        const aScore = (a.membership_count ?? 0) + (a.seat_count ?? 0);
        const bScore = (b.membership_count ?? 0) + (b.seat_count ?? 0);
        if (bScore !== aScore) return bScore - aScore;
        return a.full_name.localeCompare(b.full_name);
      });
      items = items.slice(offset, offset + limit);
    }

    return jsonNoStore({
      items,
      total: count ?? items.length,
      limit,
      offset,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load people";
    return jsonNoStore({ error: message, items: [], total: 0, limit: 50, offset: 0 }, 500);
  }
}
