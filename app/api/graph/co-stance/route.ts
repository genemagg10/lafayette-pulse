import { NextRequest } from "next/server";
import { jsonNoStore } from "@/lib/safe-list";
import { tryGetSupabase } from "@/lib/supabase";
import { buildCoStanceMatrix, type StanceActorType } from "@/lib/stances";
import { labelStances, loadStanceSnapshot } from "@/lib/stance-data";

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

    const actorParam = request.nextUrl.searchParams.get("actor") || "org";
    if (actorParam !== "org" && actorParam !== "organization" && actorParam !== "person") {
      return jsonNoStore({ error: "actor must be org or person" }, 400);
    }
    const actor: StanceActorType =
      actorParam === "person" ? "person" : "organization";

    const minShared = Math.round(
      parseBounded(request.nextUrl.searchParams.get("min_shared"), 2, 1, 20)
    );
    const limitActors = Math.round(
      parseBounded(request.nextUrl.searchParams.get("limit_actors"), 40, 2, 80)
    );

    const snapshot = await loadStanceSnapshot(supabase);
    const labeled = labelStances(snapshot);
    const payload = buildCoStanceMatrix(labeled, {
      actor,
      minShared,
      limitActors,
    });
    return jsonNoStore(payload);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to load co-stance";
    return jsonNoStore({ error: message }, 500);
  }
}
