import { NextRequest } from "next/server";
import { jsonNoStore } from "@/lib/safe-list";
import { tryGetSupabase } from "@/lib/supabase";
import { isUuid } from "@/lib/civic-graph";
import { buildConflictRibbon } from "@/lib/stances";
import {
  decorateMeasures,
  labelStances,
  loadStanceSnapshot,
  stancesForMeasure,
} from "@/lib/stance-data";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = params.id;
    if (!isUuid(id)) return jsonNoStore({ error: "Invalid measure id" }, 400);

    const supabase = tryGetSupabase();
    if (!supabase) return jsonNoStore({ error: "Database unavailable" }, 503);

    const snapshot = await loadStanceSnapshot(supabase);
    const labeled = labelStances(snapshot);
    const measure = decorateMeasures(snapshot, labeled).find((row) => row.id === id);
    if (!measure) return jsonNoStore({ error: "Measure not found" }, 404);

    const stances = stancesForMeasure(labeled, id);
    const ribbon = buildConflictRibbon(measure, stances);

    return jsonNoStore({
      measure,
      stances: stances.map((row) => ({
        id: row.id,
        actor_type: row.actor_type,
        actor_id: row.actor_id,
        actor_label: row.actor_label,
        polarity: row.polarity,
        confidence: row.confidence,
        evidence_quote: row.evidence_quote,
        source_url: row.source_url,
        as_of: row.as_of,
        subject_title: row.subject_title,
      })),
      ribbon,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to load measure stances";
    return jsonNoStore({ error: message }, 500);
  }
}
