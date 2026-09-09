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
  footprint: number;
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
  connected_count: number;
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

export const PERSON_COLOR = "#C4D0BE";
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

export function connectedOrgIds(
  orgIds: Iterable<string>,
  membersByOrg: Map<string, Set<string>>,
  minShared: number
): string[] {
  const ids = Array.from(orgIds);
  const connected = new Set<string>();
  for (let i = 0; i < ids.length; i += 1) {
    for (let j = i + 1; j < ids.length; j += 1) {
      const { shared } = jaccardSets(
        membersByOrg.get(ids[i]) ?? new Set<string>(),
        membersByOrg.get(ids[j]) ?? new Set<string>()
      );
      if (shared < minShared) continue;
      connected.add(ids[i]);
      connected.add(ids[j]);
    }
  }
  return ids.filter((id) => connected.has(id));
}

export function selectOrgAffinityIds(
  orgs: { id: string; name: string; org_type: OrgType }[],
  membersByOrg: Map<string, Set<string>>,
  options: {
    orgType?: OrgType | null;
    focusOrg?: string | null;
    minShared: number;
    limitOrgs: number;
    footprints?: Map<string, number>;
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

  const typedIds = typed.map((org) => org.id);
  const connected = new Set(
    connectedOrgIds(typedIds, membersByOrg, options.minShared)
  );
  return typed
    .filter((org) => connected.has(org.id))
    .sort((a, b) => {
      const footA =
        options.footprints?.get(a.id) ?? membersByOrg.get(a.id)?.size ?? 0;
      const footB =
        options.footprints?.get(b.id) ?? membersByOrg.get(b.id)?.size ?? 0;
      if (footB !== footA) return footB - footA;
      return a.name.localeCompare(b.name);
    })
    .slice(0, options.limitOrgs)
    .map((org) => org.id);
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

export function mixedActorGraph(
  nodes: Array<{ kind?: GraphNodeKind | string | null }>
): boolean {
  let people = false;
  let orgs = false;
  for (const node of nodes) {
    if (node.kind === "person") people = true;
    if (node.kind === "organization") orgs = true;
    if (people && orgs) return true;
  }
  return false;
}

export function scaleSize(value: number, min: number, max: number, lo = 6, hi = 18): number {
  if (max <= min) return (lo + hi) / 2;
  const t = Math.max(0, Math.min(1, (value - min) / (max - min)));
  return lo + t * (hi - lo);
}

/** Affinity-graph square diameter (px at camera 1). Area encodes current members. */
export const ORG_AFFINITY_DIAMETER_FLOOR_PX = 16;
export const ORG_AFFINITY_DIAMETER_CAP_PX = 112;

/** Diameter from member count as true area (sqrt), small floor, wide cap. */
export function orgAffinityNodeDiameter(
  memberCount: number,
  maxMembers: number,
  cap = ORG_AFFINITY_DIAMETER_CAP_PX
): number {
  const n = Math.max(0, memberCount);
  const max = Math.max(maxMembers, 1);
  const t = Math.sqrt(n / max);
  return Math.max(ORG_AFFINITY_DIAMETER_FLOOR_PX, cap * t);
}

/** Sigma node `size` is radius. */
export function orgAffinityNodeSize(
  memberCount: number,
  maxMembers: number,
  cap = ORG_AFFINITY_DIAMETER_CAP_PX
): number {
  return orgAffinityNodeDiameter(memberCount, maxMembers, cap) / 2;
}

/** People-overview circle radius from board footprint as area, not title. */
export const PERSON_FOOTPRINT_SIZE_FLOOR = 10;
export const PERSON_FOOTPRINT_SIZE_CAP = 36;

export function personFootprintNodeSize(
  footprint: number,
  maxFootprint: number,
  minSize = PERSON_FOOTPRINT_SIZE_FLOOR,
  maxSize = PERSON_FOOTPRINT_SIZE_CAP
): number {
  if (maxFootprint <= 0) return minSize;
  const t = Math.sqrt(Math.max(0, footprint) / maxFootprint);
  return Math.max(minSize, maxSize * t);
}

/** Ego-neighborhood person size from person–person degree, not title. */
export function personDegreeNodeSize(
  degree: number,
  maxDegree: number,
  lo = 8,
  hi = 22
): number {
  return scaleSize(Math.max(0, degree), 0, Math.max(maxDegree, 1), lo, hi);
}

export interface PeopleAffinityNode {
  id: string;
  label: string;
  photo_url: string | null;
  degree: number;
  footprint: number;
  size: number;
}

export interface PeopleAffinityEdge {
  source: string;
  target: string;
  shared: number;
  shared_names: string[];
  shared_entities: SharedEntity[];
}

export interface PeopleAffinityResponse {
  label: "Shared boards";
  current_only: boolean;
  min_shared: number;
  limit_people: number;
  has_seat: boolean | null;
  connected_count: number;
  nodes: PeopleAffinityNode[];
  edges: PeopleAffinityEdge[];
}

function readFootprint(
  source: Map<string, number> | Record<string, number> | undefined,
  id: string
): number {
  if (!source) return 0;
  if (source instanceof Map) return source.get(id) ?? 0;
  return source[id] ?? 0;
}

export function assemblePeopleAffinity(
  people: { id: string; full_name: string; photo_url: string | null }[],
  boardsByPerson: Map<string, Set<string>>,
  orgLabels: Map<string, string>,
  options: {
    currentOnly: boolean;
    minShared: number;
    limitPeople: number;
    hasSeat?: boolean | null;
    seatedIds?: Set<string> | null;
    footprintByPerson?: Map<string, number> | Record<string, number>;
  }
): PeopleAffinityResponse {
  const hasSeat = options.hasSeat ?? null;
  const peopleById = new Map(people.map((row) => [row.id, row]));
  const candidateIds = Array.from(boardsByPerson.keys()).filter((id) => {
    if (!peopleById.has(id)) return false;
    if (hasSeat) return Boolean(options.seatedIds?.has(id));
    return true;
  });

  const edges: PeopleAffinityEdge[] = [];
  const degree = new Map<string, number>();
  for (const id of candidateIds) degree.set(id, 0);

  for (let i = 0; i < candidateIds.length; i += 1) {
    for (let j = i + 1; j < candidateIds.length; j += 1) {
      const leftId = candidateIds[i];
      const rightId = candidateIds[j];
      const left = boardsByPerson.get(leftId) ?? new Set<string>();
      const right = boardsByPerson.get(rightId) ?? new Set<string>();
      const sharedIds = Array.from(left).filter((id) => right.has(id));
      if (sharedIds.length < options.minShared) continue;
      const sharedEntities = sharedIds
        .map((id) => {
          const label = orgLabels.get(id);
          return label
            ? { id, label, kind: "organization" as const }
            : null;
        })
        .filter(
          (row): row is { id: string; label: string; kind: "organization" } =>
            Boolean(row)
        )
        .sort((a, b) => a.label.localeCompare(b.label));
      edges.push({
        source: leftId,
        target: rightId,
        shared: sharedEntities.length,
        shared_names: sharedEntities.map((row) => row.label),
        shared_entities: sharedEntities,
      });
      degree.set(leftId, (degree.get(leftId) ?? 0) + 1);
      degree.set(rightId, (degree.get(rightId) ?? 0) + 1);
    }
  }

  const connected = candidateIds.filter((id) => (degree.get(id) ?? 0) > 0);
  const ranked = connected
    .slice()
    .sort((a, b) => {
      const foot =
        readFootprint(options.footprintByPerson, b) -
        readFootprint(options.footprintByPerson, a);
      if (foot) return foot;
      const deg = (degree.get(b) ?? 0) - (degree.get(a) ?? 0);
      if (deg) return deg;
      return peopleById.get(a)!.full_name.localeCompare(
        peopleById.get(b)!.full_name
      );
    });

  const shown = ranked.slice(0, options.limitPeople);
  const kept = new Set(shown);
  const maxFootprint = shown.reduce(
    (max, id) => Math.max(max, readFootprint(options.footprintByPerson, id)),
    0
  );

  return {
    label: "Shared boards",
    current_only: options.currentOnly,
    min_shared: options.minShared,
    limit_people: options.limitPeople,
    has_seat: hasSeat,
    connected_count: connected.length,
    nodes: shown.map((id) => {
      const person = peopleById.get(id)!;
      const personDegree = degree.get(id) ?? 0;
      const footprint = readFootprint(options.footprintByPerson, id);
      return {
        id: person.id,
        label: person.full_name,
        photo_url: person.photo_url,
        degree: personDegree,
        footprint,
        size: personFootprintNodeSize(footprint, maxFootprint),
      };
    }),
    edges: edges.filter(
      (edge) => kept.has(edge.source) && kept.has(edge.target)
    ),
  };
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
