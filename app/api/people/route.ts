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
    const limit = parseLimit(request, 50, 100);
    const offset = parseOffset(request);

    let seatedIds: string[] | null = null;
    if (hasSeat !== null) {
      const { data, error } = await supabase.from("seat_holders").select("person_id");
      if (error) return jsonNoStore({ error: error.message }, 500);
      seatedIds = Array.from(new Set((data ?? []).map((row) => row.person_id as string)));
    }

    let query = supabase
      .from("people")
      .select("*", { count: "exact" })
      .order("full_name", { ascending: true });

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

    const { data, error, count } = await query.range(offset, offset + limit - 1);
    if (error) return jsonNoStore({ error: error.message }, 500);

    const people = (data ?? []) as PersonRow[];
    let items = people;
    if (people.length > 0) {
      const snapshot = await loadGraphSnapshot(supabase);
      const summary = personRoleSummary(
        snapshot,
        people.map((person) => person.id)
      );
      items = people.map((person) => ({
        ...person,
        ...summary.get(person.id),
      }));
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
