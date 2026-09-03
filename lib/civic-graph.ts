import type { OrgType, SeatType } from "@/lib/types";

export type GraphNodeKind = "person" | "organization" | "seat";
export type GraphEdgeKind = "membership" | "seat_holder" | "shared_board";
export type InvolvementEntity = "person" | "org";
export type InvolvementMetric = "degree" | "formal";

export interface SharedEntity {
  id: string;
  label: string;
  kind: "person" | "organization";
}

export interface EgoCenter {
  id: string;
  full_name: string;
  photo_url: string | null;
}

export interface CivicGraphNode {
  id: string;
  kind: GraphNodeKind;
  label: string;
  org_type?: OrgType;
  seat_type?: SeatType;
  size: number;
  photo_url?: string | null;
}

export interface CivicGraphEdge {
  source: string;
  target: string;
  kind: GraphEdgeKind;
  role: string | null;
  is_primary: boolean;
  start_date: string | null;
  end_date: string | null;
  source_url?: string | null;
  organization_id?: string | null;
  org_name?: string | null;
  shared?: number;
  jaccard?: number;
  shared_names?: string[];
  shared_entities?: SharedEntity[];
}

export interface EgoGraphResponse {
  center: EgoCenter;
  nodes: CivicGraphNode[];
  edges: CivicGraphEdge[];
  hops: 1 | 2;
  current_only: boolean;
  alter_cap: number;
}

export interface InvolvementWeights {
  membership: number;
  seat_holder: number;
}

export interface InvolvementItem {
  id: string;
  kind: "person" | "organization";
  label: string;
  photo_url?: string | null;
  org_type?: OrgType;
  score: number;
  memberships: number;
  seat_holders: number;
  seats: { id: string; title: string; org_name: string | null }[];
  boards: { id: string; name: string; role: string | null }[];
}

export interface InvolvementResponse {
  entity: InvolvementEntity;
  metric: InvolvementMetric;
  label: "Board footprint" | "Formal seats";
  weights: InvolvementWeights;
  current_only: boolean;
  items: InvolvementItem[];
}

export interface OrgAffinityNode {
  id: string;
  label: string;
  org_type: OrgType;
  member_count: number;
  size: number;
}

export interface OrgAffinityEdge {
  source: string;
  target: string;
  shared: number;
  jaccard: number;
  shared_names: string[];
  shared_entities: SharedEntity[];
}

export interface OrgAffinityResponse {
  label: "Shared membership";
  current_only: boolean;
  min_jaccard: number;
  min_shared: number;
  limit_orgs: number;
  org_type: OrgType | null;
  focus_org: string | null;
  nodes: OrgAffinityNode[];
  edges: OrgAffinityEdge[];
}

export interface SharedBoardOverlap {
  person: { id: string; full_name: string; photo_url: string | null };
  organizations: { id: string; name: string }[];
}

/** Paul Tol / Wong-inspired palette — colorblind-safe. */
export const ORG_TYPE_COLORS: Record<OrgType, string> = {
  city_body: "#0072B2",
  civic: "#009E73",
  foundation: "#E69F00",
  interest: "#CC79A7",
  campaign: "#D55E00",
  other: "#6B6B6B",
};

export const PERSON_COLOR = "#2C3E2D";
export const SEAT_COLOR = "#56B4E9";
/** Structural current edges — Facelift ink-faint, not near-black forest-700. */
export const CURRENT_EDGE_COLOR = "#8A938C";
/** Past tenure — Facelift line-strong. */
export const PAST_EDGE_COLOR = "#C9C5B8";
/** Primary role or seated edges stay Facelift forest. */
export const PRIMARY_EDGE_COLOR = "#24352A";
export const EGO_CENTER_SIZE = 17;
export const EGO_HALO_COLOR = "#FFFFFF";
export const EGO_HALO_WIDTH_PX = 2;
/** Org affinity slider default (VIZ_PASS_V1 §9). Range 0.25–0.30. */
export const DEFAULT_ORG_AFFINITY_JACCARD = 0.28;

export const INVOLVEMENT_METRICS: Record<
  InvolvementMetric,
  { label: InvolvementResponse["label"]; weights: InvolvementWeights }
> = {
  degree: {
    label: "Board footprint",
    weights: { membership: 1, seat_holder: 1 },
  },
  formal: {
    label: "Formal seats",
    weights: { membership: 1, seat_holder: 2 },
  },
};

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export function todayISO(asOf: Date = new Date()): string {
  return asOf.toISOString().slice(0, 10);
}

/** Null end_date means current; future end_date is still current. */
export function isCurrentTenure(
  endDate: string | null | undefined,
  asOf: Date = new Date()
): boolean {
  if (!endDate) return true;
  return endDate >= todayISO(asOf);
}

export function sanitizeIlike(raw: string): string {
  return raw.replace(/[%_,()]/g, " ").replace(/\s+/g, " ").trim();
}

export function involvementScore(
  memberships: number,
  seatHolders: number,
  metric: InvolvementMetric
): number {
  const { weights } = INVOLVEMENT_METRICS[metric];
  return memberships * weights.membership + seatHolders * weights.seat_holder;
}

export function filterOrgsByType<T extends { org_type: OrgType }>(
  orgs: T[],
  orgType?: OrgType | null
): T[] {
  if (!orgType) return orgs;
  return orgs.filter((org) => org.org_type === orgType);
}

/** Focus org plus 1-hop shared-membership neighbors (min shared people). */
export function orgAffinityEgoIds(
  focusId: string,
  membersByOrg: Map<string, Set<string>>,
  candidateIds: Iterable<string>,
  minShared: number
): string[] {
  const focusMembers = membersByOrg.get(focusId) ?? new Set<string>();
  const neighbors: string[] = [];
  Array.from(candidateIds).forEach((id) => {
    if (id === focusId) return;
    const { shared } = jaccardSets(
      focusMembers,
      membersByOrg.get(id) ?? new Set<string>()
    );
    if (shared >= minShared) neighbors.push(id);
  });
  return [focusId, ...neighbors];
}

export function selectOrgAffinityIds(
  orgs: { id: string; name: string; org_type: OrgType }[],
  membersByOrg: Map<string, Set<string>>,
  options: {
    orgType?: OrgType | null;
    focusOrg?: string | null;
    minShared: number;
    limitOrgs: number;
  }
): string[] {
  const typed = filterOrgsByType(orgs, options.orgType);
  const focus = options.focusOrg
    ? orgs.find((org) => org.id === options.focusOrg)
    : undefined;

  if (focus) {
    const candidateIds = new Set(typed.map((org) => org.id));
    candidateIds.add(focus.id);
    const [centerId, ...neighborIds] = orgAffinityEgoIds(
      focus.id,
      membersByOrg,
      candidateIds,
      options.minShared
    );
    return [centerId, ...neighborIds.slice(0, Math.max(options.limitOrgs - 1, 0))];
  }

  return typed
    .map((org) => ({
      id: org.id,
      name: org.name,
      size: membersByOrg.get(org.id)?.size ?? 0,
    }))
    .filter((row) => row.size > 0)
    .sort((a, b) => {
      if (b.size !== a.size) return b.size - a.size;
      return a.name.localeCompare(b.name);
    })
    .slice(0, options.limitOrgs)
    .map((row) => row.id);
}

export function sharedBoardPersonOverlaps(
  personId: string,
  boardsByPerson: Map<string, Set<string>>
): { personId: string; orgIds: string[] }[] {
  const mine = boardsByPerson.get(personId);
  if (!mine || mine.size === 0) return [];
  const overlaps: { personId: string; orgIds: string[] }[] = [];
  Array.from(boardsByPerson.entries()).forEach(([otherId, orgs]) => {
    if (otherId === personId) return;
    const orgIds = Array.from(orgs).filter((id) => mine.has(id));
    if (orgIds.length === 0) return;
    overlaps.push({ personId: otherId, orgIds });
  });
  overlaps.sort((a, b) => b.orgIds.length - a.orgIds.length || a.personId.localeCompare(b.personId));
  return overlaps;
}

export function jaccardSets(
  a: Set<string>,
  b: Set<string>
): { shared: number; union: number; jaccard: number } {
  let shared = 0;
  Array.from(a).forEach((id) => {
    if (b.has(id)) shared += 1;
  });
  const union = a.size + b.size - shared;
  return {
    shared,
    union,
    jaccard: union === 0 ? 0 : shared / union,
  };
}

export function nodeColor(kind: GraphNodeKind, orgType?: OrgType): string {
  if (kind === "person") return PERSON_COLOR;
  if (kind === "seat") return SEAT_COLOR;
  return ORG_TYPE_COLORS[orgType || "other"];
}

export function nodeType(kind: GraphNodeKind): "circle" | "square" | "diamond" {
  if (kind === "organization") return "square";
  if (kind === "seat") return "diamond";
  return "circle";
}

export function scaleSize(value: number, min: number, max: number, lo = 6, hi = 18): number {
  if (max <= min) return (lo + hi) / 2;
  const t = Math.max(0, Math.min(1, (value - min) / (max - min)));
  return lo + t * (hi - lo);
}

/** Role tenure line for ego edge tooltips. Null end_date means present/current. */
export function formatTenureRange(
  startDate?: string | null,
  endDate?: string | null
): string {
  const from = startDate ? startDate.slice(0, 10) : null;
  const to = endDate ? endDate.slice(0, 10) : null;
  if (!from && !to) return "Current";
  if (!from) return `until ${to}`;
  if (!to) return `${from} – present`;
  return `${from} – ${to}`;
}
