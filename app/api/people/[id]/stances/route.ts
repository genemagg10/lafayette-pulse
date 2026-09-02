import { NextRequest } from "next/server";
import { jsonNoStore } from "@/lib/safe-list";
import { tryGetSupabase } from "@/lib/supabase";
import { isUuid } from "@/lib/civic-graph";
import {
  labelStances,
  loadStanceSnapshot,
  stancesForActor,
} from "@/lib/stance-data";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = params.id;
    if (!isUuid(id)) return jsonNoStore({ error: "Invalid person id" }, 400);

    const supabase = tryGetSupabase();
    if (!supabase) return jsonNoStore({ error: "Database unavailable" }, 503);

    const snapshot = await loadStanceSnapshot(supabase);
    const person = snapshot.people.find((row) => row.id === id);
    if (!person) return jsonNoStore({ error: "Person not found" }, 404);

    const items = stancesForActor(labelStances(snapshot), "person", id).map((row) => ({
      id: row.id,
      polarity: row.polarity,
      confidence: row.confidence,
      evidence_quote: row.evidence_quote,
      source_url: row.source_url,
      as_of: row.as_of,
      subject_type: row.subject_type,
      subject_id: row.subject_id,
      subject_title: row.subject_title,
    }));

    return jsonNoStore({
      person: { id: person.id, full_name: person.full_name },
      items,
      total: items.length,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to load person stances";
    return jsonNoStore({ error: message }, 500);
  }
}
