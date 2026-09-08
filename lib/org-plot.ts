import type { OrgType } from "./types.ts";
import {
  filterOrgsByType,
  involvementScore,
  isCurrentTenure,
  jaccardSets,
  type OrgAffinityResponse,
} from "./civic-graph.ts";
import type { StanceActorType, StancePolarity, StanceSubjectType } from "./stances.ts";

export type OrgPlotView = "structure" | "stance";
export type OrgPlotStance = "support" | "oppose" | "endorse" | "none";

export const STRUCTURE_CAPTION =
  "Size is members. Place is footprint and shared boards — not political alignment.";
export const STANCE_CAPTION =
  "Size is members. Place is this organization’s own recorded stance — not a member’s quote, and not a left–right score.";
export const STANCE_EMPTY_COPY =
  "No organization is on the record for this measure yet. People quotes stay on the measure ribbon.";
export const NOT_ON_RECORD_HEADER = "Present, not on record";

export const BUBBLE_FLOOR_PX = 18;
export const BUBBLE_CAP_DESKTOP_PX = 56;
export const BUBBLE_CAP_MOBILE_PX = 44;
export const BUBBLE_FILL_OPACITY = 0.88;
export const BUBBLE_STROKE_PX = 1.5;
export const SELECTED_RING_PX = 2;
export const CANVAS_HEX = "#F7F6F2";
export const MEDIAN_HAIRLINE = "#C9C5B8";
export const FOREST_HEX = "#24352A";

export const STRUCTURE_CORNERS = {
  highReachHighFootprint: "Broad presence",
  lowReachHighFootprint: "Large, inward",
  highReachLowFootprint: "Connectors",
  lowReachLowFootprint: "Local",
} as const;

export const STANCE_CORNERS = {
  highOppose: "Organized opposition",
  highSupport: "Organized support",
  lowRecorded: "Vocal few",
} as const;

export interface OrgPlotNode {
  id: string;
  name: string;
  org_type: OrgType;
  member_count: number;
  footprint: number;
  reach: number;
  stance: OrgPlotStance;
}

export interface OrgPlotMeasure {
  id: string;
  short_code: string | null;
  title: string;
  summary: string | null;
  status: string;
  election_date: string | null;
  org_stance_count: number;
}

export interface OrgPlotResponse {
  view: OrgPlotView;
  label: "Org plot";
  caption: string;
  nodes: OrgPlotNode[];
  median_x: number;
  median_y: number;
  measure: OrgPlotMeasure | null;
  measures: OrgPlotMeasure[];
  empty_copy: string | null;
}

export interface OrgPlotStanceRow {
  actor_type: StanceActorType;
  actor_id: string;
  subject_type: StanceSubjectType;
  subject_id: string | null;
  polarity: StancePolarity;
  confidence?: number;
}

export interface OrgPlotMeasureInput {
  id: string;
  title: string;
  short_code: string | null;
  summary: string | null;
  status: string;
  election_date: string | null;
}

export interface OrgPlotSnapshot {
  organizations: { id: string; name: string; org_type: OrgType }[];
  memberships: {
    person_id: string;
    organization_id: string;
    end_date: string | null;
  }[];
  seats: { id: string; organization_id: string | null }[];
  seatHolders: { seat_id: string; end_date: string | null }[];
}

export interface PixelPoint {
  id: string;
  x: number;
  y: number;
  r: number;
  sideX: -1 | 0 | 1;
  sideY: -1 | 0 | 1;
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

/** Shared-board reach: other orgs with ≥1 shared current member. */
export function orgReachCounts(
  membersByOrg: Map<string, Set<string>>
): Map<string, number> {
  const ids = Array.from(membersByOrg.keys());
  const reach = new Map<string, number>();
  for (const id of ids) reach.set(id, 0);
  for (let i = 0; i < ids.length; i += 1) {
    for (let j = i + 1; j < ids.length; j += 1) {
      const left = ids[i];
      const right = ids[j];
      const { shared } = jaccardSets(
        membersByOrg.get(left) ?? new Set(),
        membersByOrg.get(right) ?? new Set()
      );
      if (shared < 1) continue;
      reach.set(left, (reach.get(left) ?? 0) + 1);
      reach.set(right, (reach.get(right) ?? 0) + 1);
    }
  }
  return reach;
}

export function membersByOrgFromSnapshot(
  snapshot: OrgPlotSnapshot,
  currentOnly = true
): Map<string, Set<string>> {
  const membersByOrg = new Map<string, Set<string>>();
  for (const membership of snapshot.memberships) {
    if (currentOnly && !isCurrentTenure(membership.end_date)) continue;
    const set = membersByOrg.get(membership.organization_id) ?? new Set();
    set.add(membership.person_id);
    membersByOrg.set(membership.organization_id, set);
  }
  return membersByOrg;
}

/** Same degree metric as orgFootprintScores in civic-graph-data. */
export function plotFootprintScores(
  snapshot: OrgPlotSnapshot,
  currentOnly = true
): Map<string, number> {
  const scores = new Map<string, { members: number; seats: number }>();
  const bump = (orgId: string, key: "members" | "seats") => {
    const row = scores.get(orgId) ?? { members: 0, seats: 0 };
    row[key] += 1;
    scores.set(orgId, row);
  };
  for (const membership of snapshot.memberships) {
    if (currentOnly && !isCurrentTenure(membership.end_date)) continue;
    bump(membership.organization_id, "members");
  }
  const seatsById = new Map(snapshot.seats.map((seat) => [seat.id, seat]));
  for (const holder of snapshot.seatHolders) {
    if (currentOnly && !isCurrentTenure(holder.end_date)) continue;
    const orgId = seatsById.get(holder.seat_id)?.organization_id;
    if (orgId) bump(orgId, "seats");
  }
  return new Map(
    Array.from(scores.entries()).map(([id, row]) => [
      id,
      involvementScore(row.members, row.seats, "degree"),
    ])
  );
}

export function plotMemberCounts(
  snapshot: OrgPlotSnapshot,
  currentOnly = true
): Map<string, number> {
  const counts = new Map<string, Set<string>>();
  for (const membership of snapshot.memberships) {
    if (currentOnly && !isCurrentTenure(membership.end_date)) continue;
    const set = counts.get(membership.organization_id) ?? new Set();
    set.add(membership.person_id);
    counts.set(membership.organization_id, set);
  }
  return new Map(Array.from(counts.entries()).map(([id, set]) => [id, set.size]));
}

/**
 * Own quote-backed org stance for one measure.
 * Person rows are ignored — never rolled up through membership.
 */
export function orgStanceByActor(
  stances: OrgPlotStanceRow[],
  measureId: string
): Map<string, Exclude<OrgPlotStance, "none">> {
  const picked = new Map<
    string,
    { polarity: Exclude<OrgPlotStance, "none">; confidence: number }
  >();
  for (const row of stances) {
    if (row.actor_type !== "organization") continue;
    if (row.subject_type !== "measure") continue;
    if (row.subject_id !== measureId) continue;
    if (
      row.polarity !== "support" &&
      row.polarity !== "oppose" &&
      row.polarity !== "endorse"
    ) {
      continue;
    }
    const confidence = row.confidence ?? 0;
    const prev = picked.get(row.actor_id);
    if (!prev || confidence > prev.confidence) {
      picked.set(row.actor_id, { polarity: row.polarity, confidence });
    }
  }
  return new Map(
    Array.from(picked.entries()).map(([id, row]) => [id, row.polarity])
  );
}

export function measureOrgStanceCounts(
  measures: { id: string }[],
  stances: OrgPlotStanceRow[]
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const measure of measures) counts.set(measure.id, 0);
  for (const row of stances) {
    if (row.actor_type !== "organization") continue;
    if (row.subject_type !== "measure" || !row.subject_id) continue;
    if (
      row.polarity !== "support" &&
      row.polarity !== "oppose" &&
      row.polarity !== "endorse"
    ) {
      continue;
    }
    if (!counts.has(row.subject_id)) continue;
    counts.set(row.subject_id, (counts.get(row.subject_id) ?? 0) + 1);
  }
  return counts;
}

export function decoratePlotMeasures(
  measures: OrgPlotMeasureInput[],
  stances: OrgPlotStanceRow[]
): OrgPlotMeasure[] {
  const counts = measureOrgStanceCounts(measures, stances);
  return measures
    .map((measure) => ({
      id: measure.id,
      short_code: measure.short_code,
      title: measure.title,
      summary: measure.summary,
      status: measure.status,
      election_date: measure.election_date,
      org_stance_count: counts.get(measure.id) ?? 0,
    }))
    .sort((a, b) => {
      const dateA = a.election_date || "";
      const dateB = b.election_date || "";
      if (dateA !== dateB) return dateB.localeCompare(dateA);
      return (a.short_code || a.title).localeCompare(b.short_code || b.title);
    });
}

/** Default = most attributed org stances; ties break to newest election. */
export function defaultMeasureId(measures: OrgPlotMeasure[]): string | null {
  if (measures.length === 0) return null;
  const ranked = [...measures].sort((a, b) => {
    if (b.org_stance_count !== a.org_stance_count) {
      return b.org_stance_count - a.org_stance_count;
    }
    const dateA = a.election_date || "";
    const dateB = b.election_date || "";
    if (dateA !== dateB) return dateB.localeCompare(dateA);
    return (a.short_code || a.title).localeCompare(b.short_code || b.title);
  });
  return ranked[0].id;
}

/** Diameter from member count as AREA (sqrt), with a tappable floor. */
export function bubbleDiameter(
  memberCount: number,
  maxMembers: number,
  cap = BUBBLE_CAP_DESKTOP_PX
): number {
  const n = Math.max(0, memberCount);
  const max = Math.max(maxMembers, 1);
  const t = Math.sqrt(n / max);
  return BUBBLE_FLOOR_PX + t * (cap - BUBBLE_FLOOR_PX);
}

export function footprintWord(
  footprint: number,
  medianY: number | null
): "high" | "low" | "typical" {
  if (medianY == null) return "typical";
  if (footprint > medianY) return "high";
  if (footprint < medianY) return "low";
  return "typical";
}

export function stanceAxisWord(
  stance: OrgPlotStance
): "Oppose" | "Support" | "Endorse" | "Not on record" {
  if (stance === "oppose") return "Oppose";
  if (stance === "endorse") return "Endorse";
  if (stance === "support") return "Support";
  return "Not on record";
}

export function hoverLines(
  node: Pick<OrgPlotNode, "name" | "member_count" | "reach" | "footprint" | "stance">,
  view: OrgPlotView,
  medianY: number | null
): string[] {
  const foot = `Footprint ${footprintWord(node.footprint, medianY)}`;
  const place =
    view === "structure"
      ? `Shared boards ${node.reach} · ${foot}`
      : `${stanceAxisWord(node.stance)} · ${foot}`;
  return [node.name, `Members ${node.member_count}`, place];
}

export function isOnPlot(view: OrgPlotView, stance: OrgPlotStance): boolean {
  if (view === "structure") return true;
  return stance !== "none";
}

export function plottedNodes(
  nodes: OrgPlotNode[],
  view: OrgPlotView
): OrgPlotNode[] {
  return nodes.filter((node) => isOnPlot(view, node.stance));
}

export function notOnRecordNodes(nodes: OrgPlotNode[]): OrgPlotNode[] {
  return nodes
    .filter((node) => node.stance === "none")
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Keep collision nudges inside the original median quadrant.
 * Points on a median (side 0) may slide along it but not cross.
 */
export function nudgePixelPoints(
  points: PixelPoint[],
  bounds: { minX: number; maxX: number; minY: number; maxY: number; midX: number; midY: number },
  iterations = 40
): PixelPoint[] {
  const next = points.map((point) => ({ ...point }));
  const gap = 1.5;
  for (let step = 0; step < iterations; step += 1) {
    for (let i = 0; i < next.length; i += 1) {
      for (let j = i + 1; j < next.length; j += 1) {
        const a = next[i];
        const b = next[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const minDist = a.r + b.r + gap;
        const dist = Math.hypot(dx, dy) || 0.01;
        if (dist >= minDist) continue;
        const push = (minDist - dist) / 2;
        const ux = dx / dist;
        const uy = dy / dist;
        a.x -= ux * push;
        a.y -= uy * push;
        b.x += ux * push;
        b.y += uy * push;
      }
    }
    for (const point of next) {
      const minX = bounds.minX + point.r;
      const maxX = bounds.maxX - point.r;
      const minY = bounds.minY + point.r;
      const maxY = bounds.maxY - point.r;
      if (point.sideX < 0) point.x = Math.min(point.x, bounds.midX - point.r - 1);
      if (point.sideX > 0) point.x = Math.max(point.x, bounds.midX + point.r + 1);
      if (point.sideY < 0) point.y = Math.max(point.y, bounds.midY + point.r + 1);
      if (point.sideY > 0) point.y = Math.min(point.y, bounds.midY - point.r - 1);
      point.x = Math.min(maxX, Math.max(minX, point.x));
      point.y = Math.min(maxY, Math.max(minY, point.y));
    }
  }
  return next;
}

export function compareSide(value: number, medianValue: number): -1 | 0 | 1 {
  if (value > medianValue) return 1;
  if (value < medianValue) return -1;
  return 0;
}

export function buildOrgPlot(
  snapshot: OrgPlotSnapshot,
  options: {
    view: OrgPlotView;
    measureId?: string | null;
    orgType?: OrgType | null;
    currentOnly?: boolean;
    measures?: OrgPlotMeasureInput[];
    stances?: OrgPlotStanceRow[];
  }
): OrgPlotResponse {
  const view = options.view;
  const currentOnly = options.currentOnly !== false;
  const measures = decoratePlotMeasures(
    options.measures ?? [],
    options.stances ?? []
  );
  const membersByOrg = membersByOrgFromSnapshot(snapshot, currentOnly);
  const footprints = plotFootprintScores(snapshot, currentOnly);
  const memberCounts = plotMemberCounts(snapshot, currentOnly);
  const reachCounts = orgReachCounts(membersByOrg);
  const typed = filterOrgsByType(snapshot.organizations, options.orgType);

  const rosterIds = new Set<string>();
  for (const org of typed) {
    const members = memberCounts.get(org.id) ?? 0;
    const footprint = footprints.get(org.id) ?? members;
    if (members > 0 || footprint > 0) rosterIds.add(org.id);
  }

  let measure: OrgPlotMeasure | null = null;
  let stanceMap = new Map<string, Exclude<OrgPlotStance, "none">>();
  if (view === "stance") {
    const chosenId =
      (options.measureId && measures.some((row) => row.id === options.measureId)
        ? options.measureId
        : null) ?? defaultMeasureId(measures);
    measure = measures.find((row) => row.id === chosenId) ?? null;
    if (measure) {
      stanceMap = orgStanceByActor(options.stances ?? [], measure.id);
    }
    for (const org of typed) {
      if (stanceMap.has(org.id)) rosterIds.add(org.id);
    }
  }

  const nodes: OrgPlotNode[] = typed
    .filter((org) => rosterIds.has(org.id))
    .map((org) => {
      const member_count = memberCounts.get(org.id) ?? 0;
      return {
        id: org.id,
        name: org.name,
        org_type: org.org_type,
        member_count,
        footprint: footprints.get(org.id) ?? member_count,
        reach: reachCounts.get(org.id) ?? 0,
        stance: (stanceMap.get(org.id) ?? "none") as OrgPlotStance,
      };
    })
    .sort((a, b) => {
      if (b.footprint !== a.footprint) return b.footprint - a.footprint;
      return a.name.localeCompare(b.name);
    });

  const plotted = plottedNodes(nodes, view);
  const medianX = median(plotted.map((node) => node.reach));
  const medianY = median(plotted.map((node) => node.footprint));
  const empty =
    view === "stance" && measure && measure.org_stance_count === 0
      ? STANCE_EMPTY_COPY
      : view === "stance" && plotted.length === 0
        ? STANCE_EMPTY_COPY
        : view === "structure" && plotted.length === 0
          ? "No organizations with current members or seats to plot yet."
          : null;

  return {
    view,
    label: "Org plot",
    caption: view === "structure" ? STRUCTURE_CAPTION : STANCE_CAPTION,
    nodes,
    median_x: medianX ?? 0,
    median_y: medianY ?? 0,
    measure,
    measures,
    empty_copy: empty,
  };
}

/** Neighbor count from an already-built affinity snapshot (same graph). */
export function reachFromAffinity(
  affinity: OrgAffinityResponse
): Map<string, number> {
  const reach = new Map<string, number>();
  for (const node of affinity.nodes) reach.set(node.id, 0);
  for (const edge of affinity.edges) {
    if (edge.shared < 1) continue;
    reach.set(edge.source, (reach.get(edge.source) ?? 0) + 1);
    reach.set(edge.target, (reach.get(edge.target) ?? 0) + 1);
  }
  return reach;
}
