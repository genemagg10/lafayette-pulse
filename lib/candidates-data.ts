import type { SupabaseClient } from "@supabase/supabase-js";
import type { CandidacyStatus } from "@/lib/types";
import { isCurrentTenure } from "@/lib/civic-graph";
import {
  loadGraphSnapshot,
  type GraphSnapshot,
} from "@/lib/civic-graph-data";
import {
  labelStances,
  loadStanceSnapshot,
  stancesForActor,
} from "@/lib/stance-data";
import type { StancePolarity } from "@/lib/stances";

export interface CandidacyRow {
  id: string;
  person_id: string;
  seat_id: string | null;
  measure_id: string | null;
  election_date: string | null;
  party_or_slate: string | null;
  status: CandidacyStatus;
  source_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface CandidateAffinity {
  organization_id: string;
  organization_name: string;
  role: string | null;
  is_current: boolean;
}

export interface CandidatePosition {
  id: string;
  subject_title: string;
  subject_type: string;
  polarity: StancePolarity;
  confidence: number;
  evidence_quote: string | null;
  source_url: string | null;
  as_of: string | null;
}

export interface CandidateItem {
  candidacy_id: string;
  person_id: string;
  full_name: string;
  bio: string | null;
  photo_url: string | null;
  website: string | null;
  metadata: Record<string, unknown>;
  status: CandidacyStatus;
  election_date: string | null;
  party_or_slate: string | null;
  source_url: string | null;
  office: string | null;
  office_org_id: string | null;
  office_org_name: string | null;
  affinities: CandidateAffinity[];
  positions: CandidatePosition[];
  support_count: number;
  oppose_count: number;
}

export const CANDIDACY_STATUS_LABELS: Record<CandidacyStatus, string> = {
  exploring: "Exploring",
  declared: "Declared",
  qualified: "Qualified",
  elected: "Elected / Seated",
  lost: "Did not win",
  withdrawn: "Withdrawn",
};

async function fetchCandidacies(
  supabase: SupabaseClient
): Promise<CandidacyRow[]> {
  const rows: CandidacyRow[] = [];
  const PAGE = 1000;
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("candidacies")
      .select(
        "id, person_id, seat_id, measure_id, election_date, party_or_slate, status, source_url, created_at, updated_at"
      )
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const batch = (data ?? []) as CandidacyRow[];
    rows.push(...batch);
    if (batch.length < PAGE) break;
    from += PAGE;
  }
  return rows;
}

function affinitiesFor(
  snapshot: GraphSnapshot,
  personId: string
): CandidateAffinity[] {
  const orgs = new Map(snapshot.organizations.map((org) => [org.id, org]));
  return snapshot.memberships
    .filter((row) => row.person_id === personId)
    .map((row) => {
      const org = orgs.get(row.organization_id);
      return {
        organization_id: row.organization_id,
        organization_name: org?.name ?? "Organization",
        role: row.role,
        is_current: isCurrentTenure(row.end_date),
      };
    })
    .sort((a, b) => {
      if (a.is_current !== b.is_current) return a.is_current ? -1 : 1;
      return a.organization_name.localeCompare(b.organization_name);
    });
}

/**
 * List candidates (people with a candidacy) decorated with their office,
 * organizational affinities (memberships), and on-the-record positions
 * (attributed, quote-backed stances). Never infers a position from membership.
 */
export async function loadCandidates(
  supabase: SupabaseClient
): Promise<CandidateItem[]> {
  const [graph, stanceSnapshot, candidacies] = await Promise.all([
    loadGraphSnapshot(supabase),
    loadStanceSnapshot(supabase),
    fetchCandidacies(supabase),
  ]);

  const peopleById = new Map(graph.people.map((row) => [row.id, row]));
  const seatsById = new Map(graph.seats.map((row) => [row.id, row]));
  const orgsById = new Map(graph.organizations.map((row) => [row.id, row]));
  const labeled = labelStances(stanceSnapshot);

  const items: CandidateItem[] = [];
  for (const candidacy of candidacies) {
    const person = peopleById.get(candidacy.person_id);
    if (!person) continue;

    const seat = candidacy.seat_id ? seatsById.get(candidacy.seat_id) : null;
    const org = seat?.organization_id ? orgsById.get(seat.organization_id) : null;

    const positions: CandidatePosition[] = stancesForActor(
      labeled,
      "person",
      person.id
    ).map((row) => ({
      id: row.id,
      subject_title: row.subject_title,
      subject_type: row.subject_type,
      polarity: row.polarity,
      confidence: row.confidence,
      evidence_quote: row.evidence_quote,
      source_url: row.source_url,
      as_of: row.as_of,
    }));

    const support_count = positions.filter(
      (p) => p.polarity === "support" || p.polarity === "endorse"
    ).length;
    const oppose_count = positions.filter((p) => p.polarity === "oppose").length;

    items.push({
      candidacy_id: candidacy.id,
      person_id: person.id,
      full_name: person.full_name,
      bio: person.bio,
      photo_url: person.photo_url,
      website: person.website,
      metadata: person.metadata ?? {},
      status: candidacy.status,
      election_date: candidacy.election_date,
      party_or_slate: candidacy.party_or_slate,
      source_url: candidacy.source_url,
      office: seat?.title ?? null,
      office_org_id: org?.id ?? null,
      office_org_name: org?.name ?? null,
      affinities: affinitiesFor(graph, person.id),
      positions,
      support_count,
      oppose_count,
    });
  }

  return items.sort((a, b) => {
    const dateA = a.election_date || "";
    const dateB = b.election_date || "";
    if (dateA !== dateB) return dateB.localeCompare(dateA);
    return a.full_name.localeCompare(b.full_name);
  });
}
