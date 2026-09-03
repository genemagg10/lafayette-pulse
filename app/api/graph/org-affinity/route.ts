import { NextRequest } from "next/server";
import { jsonNoStore, parseBoolParam } from "@/lib/safe-list";
import { tryGetSupabase } from "@/lib/supabase";
import { DEFAULT_ORG_AFFINITY_JACCARD, isUuid } from "@/lib/civic-graph";
import { buildOrgAffinity, loadGraphSnapshot } from "@/lib/civic-graph-data";
import { ORG_TYPE_LABELS, type OrgType } from "@/lib/types";

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
      DEFAULT_ORG_AFFINITY_JACCARD,
      0,
      1
    );
    const minShared = Math.round(
      parseBounded(request.nextUrl.searchParams.get("min_shared"), 1, 1, 50)
    );
    const limitOrgs = Math.round(
      parseBounded(request.nextUrl.searchParams.get("limit_orgs"), 40, 1, 80)
    );
    const rawType = request.nextUrl.searchParams.get("org_type")?.trim() || "";
    const orgType =
      rawType && rawType in ORG_TYPE_LABELS ? (rawType as OrgType) : null;
    const rawFocus = request.nextUrl.searchParams.get("focus_org")?.trim() || "";
    const focusOrg = rawFocus && isUuid(rawFocus) ? rawFocus : null;

    const snapshot = await loadGraphSnapshot(supabase);
    const payload = buildOrgAffinity(snapshot, {
      currentOnly,
      minJaccard,
      minShared,
      limitOrgs,
      orgType,
      focusOrg,
    });
    return jsonNoStore(payload);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to load shared membership";
    return jsonNoStore({ error: message }, 500);
  }
}
