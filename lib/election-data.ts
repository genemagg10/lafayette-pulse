import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ELECTION_DATE,
  buildElectionModel,
  type ElectionCandidacyRow,
  type ElectionContributionRow,
  type ElectionEventRow,
  type ElectionMeasureRow,
  type ElectionModel,
  type ElectionOrgRow,
  type ElectionPersonRow,
  type ElectionStanceRow,
} from "@/lib/election";
import { tryGetSupabase } from "@/lib/supabase";

const PAGE = 1000;

async function fetchAll<T>(
  run: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const rows: T[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await run(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < PAGE) break;
    from += PAGE;
  }
  return rows;
}

export async function loadElectionModel(
  supabase: SupabaseClient,
  nowIso = new Date().toISOString()
): Promise<ElectionModel> {
  const [measures, candidacies, people, organizations, contributions, events] =
    await Promise.all([
      fetchAll<ElectionMeasureRow>((from, to) =>
        supabase
          .from("measures")
          .select("id, title, short_code, summary, election_date, source_url, status")
          .eq("election_date", ELECTION_DATE)
          .order("id", { ascending: true })
          .range(from, to)
      ),
      fetchAll<ElectionCandidacyRow>((from, to) =>
        supabase
          .from("candidacies")
          .select("id, person_id, election_date, party_or_slate, status, source_url")
          .eq("election_date", ELECTION_DATE)
          .order("id", { ascending: true })
          .range(from, to)
      ),
      fetchAll<ElectionPersonRow>((from, to) =>
        supabase.from("people").select("id, full_name, website").order("id", { ascending: true }).range(from, to)
      ),
      fetchAll<ElectionOrgRow>((from, to) =>
        supabase.from("organizations").select("id, name").order("id", { ascending: true }).range(from, to)
      ),
      fetchAll<ElectionContributionRow>((from, to) =>
        supabase
          .from("contributions")
          .select(
            "id, filing_id, direction, counterparty_name, counterparty_org_id, counterparty_person_id, counterparty_city, counterparty_zip, counterparty_committee_id, amount, txn_date, measure_id, candidacy_id, mirror_of, source_url, filer_org_id"
          )
          .order("id", { ascending: true })
          .range(from, to)
      ),
      fetchAll<ElectionEventRow>((from, to) =>
        supabase
          .from("events")
          .select("id, title, description, event_type, starts_at, location_name, source_url, status")
          .ilike("description", "%ELECTION_COVERAGE%")
          .order("id", { ascending: true })
          .range(from, to)
      ),
    ]);

  const measureIds = measures.map((row) => row.id);
  const candidacyIds = candidacies.map((row) => row.id);
  const stanceColumns =
    "id, actor_type, actor_id, subject_type, subject_id, polarity, evidence_quote, source_url, metadata";

  const [measureStances, candidacyStances] = await Promise.all([
    measureIds.length
      ? fetchAll<ElectionStanceRow>((from, to) =>
          supabase
            .from("stances")
            .select(stanceColumns)
            .eq("subject_type", "measure")
            .in("subject_id", measureIds)
            .order("id", { ascending: true })
            .range(from, to)
        )
      : Promise.resolve([] as ElectionStanceRow[]),
    candidacyIds.length
      ? fetchAll<ElectionStanceRow>((from, to) =>
          supabase
            .from("stances")
            .select(stanceColumns)
            .eq("subject_type", "candidacy")
            .in("subject_id", candidacyIds)
            .order("id", { ascending: true })
            .range(from, to)
        )
      : Promise.resolve([] as ElectionStanceRow[]),
  ]);

  return buildElectionModel({
    nowIso,
    measures,
    candidacies,
    people,
    organizations,
    contributions,
    events,
    stances: [...measureStances, ...candidacyStances],
  });
}

export async function loadElectionPage(): Promise<
  { ok: true; model: ElectionModel } | { ok: false; error: string }
> {
  const supabase = tryGetSupabase();
  if (!supabase) {
    return { ok: false, error: "Election data is temporarily unavailable." };
  }
  try {
    const model = await loadElectionModel(supabase);
    return { ok: true, model };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load the election guide";
    return { ok: false, error: message };
  }
}
