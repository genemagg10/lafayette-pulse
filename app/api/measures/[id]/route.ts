import { NextRequest } from "next/server";
import { jsonNoStore } from "@/lib/safe-list";
import { tryGetSupabase } from "@/lib/supabase";
import { isUuid } from "@/lib/civic-graph";
import {
  decorateMeasures,
  labelStances,
  loadStanceSnapshot,
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

    return jsonNoStore(measure);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load measure";
    return jsonNoStore({ error: message }, 500);
  }
}
