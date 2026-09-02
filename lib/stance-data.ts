import type { SupabaseClient } from "@supabase/supabase-js";
import type { MeasureStatus } from "@/lib/types";
import {
  countPolarities,
  subjectKey,
  type LabeledStance,
  type MeasureListItem,
  type StanceActorType,
  type StancePolarity,
  type StanceRecord,
  type StanceSubjectType,
} from "@/lib/stances";
import type { OrganizationRow, PersonRow } from "@/lib/civic-graph-data";

export interface MeasureRow {
  id: string;
  title: string;
  short_code: string | null;
  summary: string | null;
  status: MeasureStatus;
  election_date: string | null;
  source_url: string | null;
  created_at: string;
  updated_at: string;
}

interface StanceRow {
  id: string;
  actor_type: StanceActorType;
  actor_id: string;
  subject_type: StanceSubjectType;
  subject_id: string | null;
  subject_label: string | null;
  polarity: StancePolarity;
  confidence: number;
  evidence_quote: string | null;
  source_url: string | null;
  source_chunk_id: number | null;
  as_of: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

const PAGE = 1000;

async function fetchAll<T>(
  supabase: SupabaseClient,
  table: string,
  columns = "*"
): Promise<T[]> {
  const rows: T[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const batch = (data ?? []) as T[];
    rows.push(...batch);
    if (batch.length < PAGE) break;
    from += PAGE;
  }
  return rows;
}

export interface StanceSnapshot {
  measures: MeasureRow[];
  stances: StanceRow[];
  people: PersonRow[];
  organizations: OrganizationRow[];
}

export async function loadStanceSnapshot(
  supabase: SupabaseClient
): Promise<StanceSnapshot> {
  const [measures, stances, people, organizations] = await Promise.all([
    fetchAll<MeasureRow>(
      supabase,
      "measures",
      "id, title, short_code, summary, status, election_date, source_url, created_at, updated_at"
    ),
    fetchAll<StanceRow>(
      supabase,
      "stances",
      "id, actor_type, actor_id, subject_type, subject_id, subject_label, polarity, confidence, evidence_quote, source_url, source_chunk_id, as_of, metadata, created_at, updated_at"
    ),
    fetchAll<PersonRow>(supabase, "people"),
    fetchAll<OrganizationRow>(supabase, "organizations"),
  ]);
  return { measures, stances, people, organizations };
}

export function labelStances(snapshot: StanceSnapshot): LabeledStance[] {
  const people = new Map(snapshot.people.map((row) => [row.id, row.full_name]));
  const orgs = new Map(snapshot.organizations.map((row) => [row.id, row.name]));
  const measures = new Map(snapshot.measures.map((row) => [row.id, row]));

  return snapshot.stances.map((row) => {
    const actor_label =
      row.actor_type === "organization"
        ? orgs.get(row.actor_id) || "Unknown organization"
        : people.get(row.actor_id) || "Unknown person";
    const measure = row.subject_id ? measures.get(row.subject_id) : undefined;
    const subject_title =
      (measure && (measure.short_code ? `${measure.short_code} · ${measure.title}` : measure.title)) ||
      row.subject_label ||
      row.subject_type;
    return { ...row, actor_label, subject_title };
  });
}

export function decorateMeasures(
  snapshot: StanceSnapshot,
  labeled: LabeledStance[]
): MeasureListItem[] {
  const byMeasure = new Map<string, LabeledStance[]>();
  for (const row of labeled) {
    if (row.subject_type !== "measure" || !row.subject_id) continue;
    const list = byMeasure.get(row.subject_id) ?? [];
    list.push(row);
    byMeasure.set(row.subject_id, list);
  }

  return snapshot.measures
    .map((measure) => {
      const counts = countPolarities(byMeasure.get(measure.id) ?? []);
      return {
        ...measure,
        support_count: counts.support,
        oppose_count: counts.oppose,
        endorse_count: counts.endorse,
        stance_count: counts.total,
      };
    })
    .sort((a, b) => {
      const dateA = a.election_date || "";
      const dateB = b.election_date || "";
      if (dateA !== dateB) return dateB.localeCompare(dateA);
      return a.title.localeCompare(b.title);
    });
}

export function stancesForMeasure(
  labeled: LabeledStance[],
  measureId: string
): LabeledStance[] {
  return labeled
    .filter(
      (row) =>
        row.subject_type === "measure" &&
        (row.subject_id === measureId ||
          subjectKey(row) === `measure:${measureId}`)
    )
    .sort((a, b) => {
      const order = { support: 0, endorse: 1, oppose: 2, mixed: 3, neutral: 4 };
      const d = order[a.polarity] - order[b.polarity];
      if (d !== 0) return d;
      return b.confidence - a.confidence;
    });
}

export function stancesForActor(
  labeled: LabeledStance[],
  actorType: StanceActorType,
  actorId: string
): LabeledStance[] {
  return labeled
    .filter((row) => row.actor_type === actorType && row.actor_id === actorId)
    .sort((a, b) => {
      const dateA = a.as_of || "";
      const dateB = b.as_of || "";
      if (dateA !== dateB) return dateB.localeCompare(dateA);
      return b.confidence - a.confidence;
    });
}
