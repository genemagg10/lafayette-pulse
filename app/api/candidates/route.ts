import { NextRequest } from "next/server";
import { jsonNoStore, parseLimit, parseOffset } from "@/lib/safe-list";
import { tryGetSupabase } from "@/lib/supabase";
import { loadCandidates } from "@/lib/candidates-data";

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
    const all = await loadCandidates(supabase);
    const items = all.slice(offset, offset + limit);

    return jsonNoStore({ items, total: all.length, limit, offset });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to load candidates";
    return jsonNoStore(
      { error: message, items: [], total: 0, limit: 50, offset: 0 },
      500
    );
  }
}
