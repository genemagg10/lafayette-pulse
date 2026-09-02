import { NextRequest } from "next/server";
import { jsonNoStore, parseLimit, parseOffset } from "@/lib/safe-list";
import { tryGetSupabase } from "@/lib/supabase";
import { decorateMeasures, labelStances, loadStanceSnapshot } from "@/lib/stance-data";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  try {
    const supabase = tryGetSupabase();
    if (!supabase) {
      return jsonNoStore({ items: [], total: 0, limit: 50, offset: 0 });
    }

    const limit = parseLimit(request, 50, 100);
    const offset = parseOffset(request);
    const snapshot = await loadStanceSnapshot(supabase);
    const labeled = labelStances(snapshot);
    const all = decorateMeasures(snapshot, labeled);
    const items = all.slice(offset, offset + limit);

    return jsonNoStore({
      items,
      total: all.length,
      limit,
      offset,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load measures";
    return jsonNoStore(
      { error: message, items: [], total: 0, limit: 50, offset: 0 },
      500
    );
  }
}
