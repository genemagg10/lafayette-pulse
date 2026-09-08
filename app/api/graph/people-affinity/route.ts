import { NextRequest } from "next/server";
import { jsonNoStore, parseBoolParam, parseOptionalBool } from "@/lib/safe-list";
import { tryGetSupabase } from "@/lib/supabase";
import { buildPeopleAffinity, loadGraphSnapshot } from "@/lib/civic-graph-data";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function parseBounded(
  raw: string | null,
  fallback: number,
  min: number,
  max: number
): number {
  const value = Number.parseFloat(raw || "");
  if (Number.isNaN(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

export async function GET(request: NextRequest) {
  try {
    const supabase = tryGetSupabase();
    if (!supabase) return jsonNoStore({ error: "Database unavailable" }, 503);

    const currentOnly = parseBoolParam(request, "current_only", true);
    const minShared = Math.round(
      parseBounded(request.nextUrl.searchParams.get("min_shared"), 1, 1, 50)
    );
    const limitPeople = Math.round(
      parseBounded(request.nextUrl.searchParams.get("limit_people"), 40, 1, 80)
    );
    const hasSeat = parseOptionalBool(request, "has_seat");

    const snapshot = await loadGraphSnapshot(supabase);
    const payload = buildPeopleAffinity(snapshot, {
      currentOnly,
      minShared,
      limitPeople,
      hasSeat,
    });
    return jsonNoStore(payload);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to load people affinity";
    return jsonNoStore({ error: message }, 500);
  }
}
