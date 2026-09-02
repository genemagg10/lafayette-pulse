import { NextRequest } from "next/server";
import {
  jsonNoStore,
  parseLimit,
  parseOffset,
} from "@/lib/safe-list";
import { tryGetSupabase } from "@/lib/supabase";
import { sanitizeIlike } from "@/lib/civic-graph";
import {
  currentMemberCounts,
  loadGraphSnapshot,
  type OrganizationRow,
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
    const orgType = request.nextUrl.searchParams.get("org_type")?.trim();
    const limit = parseLimit(request, 50, 100);
    const offset = parseOffset(request);

    let query = supabase
      .from("organizations")
      .select("*", { count: "exact" })
      .order("name", { ascending: true });

    if (orgType) {
      query = query.eq("org_type", orgType);
    }
    if (q) {
      query = query.or(
        `name.ilike.%${q}%,description.ilike.%${q}%,slug.ilike.%${q}%`
      );
    }

    const { data, error, count } = await query.range(offset, offset + limit - 1);
    if (error) return jsonNoStore({ error: error.message }, 500);

    const organizations = (data ?? []) as OrganizationRow[];
    const snapshot = await loadGraphSnapshot(supabase);
    const currentCounts = currentMemberCounts(snapshot, true);
    const allCounts = currentMemberCounts(snapshot, false);

    const items = organizations.map((org) => ({
      ...org,
      current_member_count: currentCounts.get(org.id) ?? 0,
      member_count: allCounts.get(org.id) ?? 0,
    }));

    return jsonNoStore({
      items,
      total: count ?? items.length,
      limit,
      offset,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to load organizations";
    return jsonNoStore(
      { error: message, items: [], total: 0, limit: 50, offset: 0 },
      500
    );
  }
}
