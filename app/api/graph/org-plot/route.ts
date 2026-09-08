import { NextRequest } from "next/server";
import { jsonNoStore } from "@/lib/safe-list";
import { tryGetSupabase } from "@/lib/supabase";
import { isUuid } from "@/lib/civic-graph";
import { loadGraphSnapshot } from "@/lib/civic-graph-data";
import { loadStanceSnapshot } from "@/lib/stance-data";
import { buildOrgPlot, type OrgPlotView } from "@/lib/org-plot";
import { ORG_TYPE_LABELS, type OrgType } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  try {
    const supabase = tryGetSupabase();
    if (!supabase) return jsonNoStore({ error: "Database unavailable" }, 503);

    const viewParam = request.nextUrl.searchParams.get("view") || "structure";
    if (viewParam !== "structure" && viewParam !== "stance") {
      return jsonNoStore({ error: "view must be structure or stance" }, 400);
    }
    const view: OrgPlotView = viewParam;

    const rawType = request.nextUrl.searchParams.get("org_type")?.trim() || "";
    const orgType =
      rawType && rawType in ORG_TYPE_LABELS ? (rawType as OrgType) : null;
    const rawMeasure = request.nextUrl.searchParams.get("measure")?.trim() || "";
    const measureId = rawMeasure && isUuid(rawMeasure) ? rawMeasure : null;

    const graphPromise = loadGraphSnapshot(supabase);
    const stancePromise =
      view === "stance" ? loadStanceSnapshot(supabase) : Promise.resolve(null);
    const [graph, stance] = await Promise.all([graphPromise, stancePromise]);

    const payload = buildOrgPlot(graph, {
      view,
      orgType,
      measureId,
      measures: stance?.measures,
      stances: stance?.stances,
    });
    return jsonNoStore(payload);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to load org plot";
    return jsonNoStore({ error: message }, 500);
  }
}
