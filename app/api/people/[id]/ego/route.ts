import { NextRequest } from "next/server";
import { jsonNoStore, parseBoolParam } from "@/lib/safe-list";
import { tryGetSupabase } from "@/lib/supabase";
import { isUuid } from "@/lib/civic-graph";
import { buildEgoGraph, loadGraphSnapshot } from "@/lib/civic-graph-data";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = params.id;
    if (!isUuid(id)) return jsonNoStore({ error: "Invalid person id" }, 400);

    const supabase = tryGetSupabase();
    if (!supabase) return jsonNoStore({ error: "Database unavailable" }, 503);

    const hopsParam = request.nextUrl.searchParams.get("hops");
    const hops: 1 | 2 = hopsParam === "2" ? 2 : 1;
    const currentOnly = parseBoolParam(request, "current_only", true);
    const alterCapRaw = parseInt(
      request.nextUrl.searchParams.get("alter_cap") || "25",
      10
    );
    const alterCap = Number.isNaN(alterCapRaw)
      ? 25
      : Math.min(Math.max(alterCapRaw, 1), 60);

    const snapshot = await loadGraphSnapshot(supabase);
    const ego = buildEgoGraph(snapshot, id, {
      hops,
      currentOnly,
      alterCap,
    });
    if (!ego) return jsonNoStore({ error: "Person not found" }, 404);
    return jsonNoStore(ego);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load ego graph";
    return jsonNoStore({ error: message }, 500);
  }
}
