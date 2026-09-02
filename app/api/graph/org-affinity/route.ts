import { NextRequest } from "next/server";
import { jsonNoStore, parseBoolParam } from "@/lib/safe-list";
import { tryGetSupabase } from "@/lib/supabase";
import { buildOrgAffinity, loadGraphSnapshot } from "@/lib/civic-graph-data";

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
    const minJaccard = parseBounded(
      request.nextUrl.searchParams.get("min_jaccard"),
      0.15,
      0,
      1
    );
    const minShared = Math.round(
      parseBounded(request.nextUrl.searchParams.get("min_shared"), 1, 1, 50)
    );
    const limitOrgs = Math.round(
      parseBounded(request.nextUrl.searchParams.get("limit_orgs"), 40, 1, 80)
    );

    const snapshot = await loadGraphSnapshot(supabase);
    const payload = buildOrgAffinity(snapshot, {
      currentOnly,
      minJaccard,
      minShared,
      limitOrgs,
    });
    return jsonNoStore(payload);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to load shared membership";
    return jsonNoStore({ error: message }, 500);
  }
}
