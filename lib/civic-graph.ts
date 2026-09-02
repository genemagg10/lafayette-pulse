import type { OrgType, SeatType } from "@/lib/types";

export type GraphNodeKind = "person" | "organization" | "seat";
export type GraphEdgeKind = "membership" | "seat_holder";
export type InvolvementEntity = "person" | "org";
export type InvolvementMetric = "degree" | "formal";

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
}

export interface OrgAffinityResponse {
  label: "Shared membership";
  current_only: boolean;
  min_jaccard: number;
  min_shared: number;
  limit_orgs: number;
  nodes: OrgAffinityNode[];
  edges: OrgAffinityEdge[];
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
export const CURRENT_EDGE_COLOR = "#364f37";
export const PAST_EDGE_COLOR = "#a0b5a1";

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
