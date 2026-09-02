import { NextRequest } from "next/server";
import { jsonNoStore, parseBoolParam, parseLimit } from "@/lib/safe-list";
import { tryGetSupabase } from "@/lib/supabase";
import { INVOLVEMENT_METRICS, type InvolvementEntity, type InvolvementMetric } from "@/lib/civic-graph";
import { buildInvolvement, loadGraphSnapshot } from "@/lib/civic-graph-data";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  try {
    const supabase = tryGetSupabase();
    if (!supabase) return jsonNoStore({ error: "Database unavailable" }, 503);

    const entityParam = request.nextUrl.searchParams.get("entity") || "person";
    const metricParam = request.nextUrl.searchParams.get("metric") || "degree";
    const entity: InvolvementEntity = entityParam === "org" ? "org" : "person";
    const metric: InvolvementMetric =
      metricParam === "formal" ? "formal" : "degree";
    if (!(metric in INVOLVEMENT_METRICS)) {
      return jsonNoStore({ error: "metric must be degree or formal" }, 400);
    }

    const currentOnly = parseBoolParam(request, "current_only", true);
    const limit = parseLimit(request, 50, 100);

    const snapshot = await loadGraphSnapshot(supabase);
    const payload = buildInvolvement(snapshot, {
      entity,
      metric,
      currentOnly,
      limit,
    });
    return jsonNoStore(payload);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to load involvement";
    return jsonNoStore({ error: message }, 500);
  }
}
