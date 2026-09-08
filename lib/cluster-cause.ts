import type { SharedEntity } from "./civic-graph";
import type { GraphRangeStop } from "./graph-range";

export const MIXED_BOARDS_LABEL = "Mixed boards";
export const CLUSTER_LABEL_INK = "#1A2420";
export const CLUSTER_LABEL_SIZE_PX = 11;
export const CLUSTER_WASH_OPACITY = 0.12;
export const CLUSTER_MIXED_STROKE = "#C9C5B8";
export const MIN_CLUSTER_SIZE = 3;
export const MIXED_ORG_LIST_MAX = 3;

/** Wide overview only. Most involved stays a named graph — no pill, no wash. */
export function clusterCauseOnStop(stop: GraphRangeStop): boolean {
  return stop === "wider" || stop === "all";
}

/** Short muted set. Stable per org. Not org_type fills. Not a neon per cluster. */
export const CLUSTER_WASH_COLORS = [
  "#6E7A72",
  "#7A7066",
  "#66727A",
  "#7A6E66",
  "#70667A",
  "#667A70",
] as const;

export interface ClusterEdge {
  source: string;
  target: string;
  shared_entities?: Array<{
    id: string;
    label: string;
    kind?: SharedEntity["kind"] | "seat";
  }>;
  shared_names?: string[];
}

export interface ClusterOrg {
  id: string;
  label: string;
  people: number;
  edges: number;
}

export type ClusterCause =
  | {
      id: string;
      kind: "org";
      label: string;
      orgId: string;
      memberIds: string[];
      topOrgs: ClusterOrg[];
    }
  | {
      id: string;
      kind: "mixed";
      label: typeof MIXED_BOARDS_LABEL;
      orgId: null;
      memberIds: string[];
      topOrgs: ClusterOrg[];
    };

export function clusterWashColor(orgId: string): string {
  let hash = 0;
  for (let i = 0; i < orgId.length; i += 1) {
    hash = (hash * 31 + orgId.charCodeAt(i)) | 0;
  }
  const index = Math.abs(hash) % CLUSTER_WASH_COLORS.length;
  return CLUSTER_WASH_COLORS[index];
}

function edgeKey(source: string, target: string): string {
  return source < target ? `${source}|${target}` : `${target}|${source}`;
}

function orgsOnEdge(edge: ClusterEdge): Array<{ id: string; label: string }> {
  if (edge.shared_entities && edge.shared_entities.length > 0) {
    return edge.shared_entities
      .filter(
        (entity) =>
          entity.kind === "organization" || entity.kind == null
      )
      .map((entity) => ({ id: entity.id, label: entity.label }));
  }
  return (edge.shared_names ?? []).map((label, index) => ({
    id: `name:${label}:${index}`,
    label,
  }));
}

export function connectedComponents(
  nodeIds: readonly string[],
  edges: readonly ClusterEdge[]
): string[][] {
  const parent = new Map<string, string>();
  for (const id of nodeIds) parent.set(id, id);
  const find = (id: string): string => {
    let cur = parent.get(id) ?? id;
    while (parent.get(cur) !== cur) {
      const next = parent.get(cur) ?? cur;
      parent.set(cur, parent.get(next) ?? next);
      cur = next;
    }
    return cur;
  };
  const union = (a: string, b: string) => {
    const pa = find(a);
    const pb = find(b);
    if (pa === pb) return;
    if (pa < pb) parent.set(pb, pa);
    else parent.set(pa, pb);
  };
  const idSet = new Set(nodeIds);
  for (const edge of edges) {
    if (!idSet.has(edge.source) || !idSet.has(edge.target)) continue;
    if (edge.source === edge.target) continue;
    union(edge.source, edge.target);
  }
  const groups = new Map<string, string[]>();
  for (const id of nodeIds) {
    const root = find(id);
    const list = groups.get(root) ?? [];
    list.push(id);
    groups.set(root, list);
  }
  return Array.from(groups.values()).map((list) => list.slice().sort());
}

export function orgStatsForMembers(
  memberIds: readonly string[],
  edges: readonly ClusterEdge[]
): ClusterOrg[] {
  const members = new Set(memberIds);
  const seenEdges = new Set<string>();
  const people = new Map<string, Set<string>>();
  const labels = new Map<string, string>();
  const edgeCount = new Map<string, number>();

  for (const edge of edges) {
    if (!members.has(edge.source) || !members.has(edge.target)) continue;
    if (edge.source === edge.target) continue;
    const key = edgeKey(edge.source, edge.target);
    if (seenEdges.has(key)) continue;
    seenEdges.add(key);
    for (const org of orgsOnEdge(edge)) {
      if (!org.id) continue;
      labels.set(org.id, org.label);
      const set = people.get(org.id) ?? new Set<string>();
      set.add(edge.source);
      set.add(edge.target);
      people.set(org.id, set);
      edgeCount.set(org.id, (edgeCount.get(org.id) ?? 0) + 1);
    }
  }

  return Array.from(people.entries())
    .map(([id, set]) => ({
      id,
      label: labels.get(id) ?? id,
      people: set.size,
      edges: edgeCount.get(id) ?? 0,
    }))
    .sort((a, b) => {
      if (b.people !== a.people) return b.people - a.people;
      if (b.edges !== a.edges) return b.edges - a.edges;
      return a.label.localeCompare(b.label) || a.id.localeCompare(b.id);
    });
}

export function topSharedOrgs(
  memberIds: readonly string[],
  edges: readonly ClusterEdge[],
  n = MIXED_ORG_LIST_MAX
): ClusterOrg[] {
  return orgStatsForMembers(memberIds, edges).slice(0, n);
}

export function coveringOrgs(
  memberIds: readonly string[],
  edges: readonly ClusterEdge[]
): ClusterOrg[] {
  const size = memberIds.length;
  return orgStatsForMembers(memberIds, edges).filter((org) => org.people >= size);
}

/**
 * One cause per connected group already implied by shared-board edges.
 * If a single org covers every person in the group, that org is the cause.
 * Otherwise the cause is mixed. No layout or community detection.
 */
export function buildClusterCauses(
  nodeIds: readonly string[],
  edges: readonly ClusterEdge[]
): ClusterCause[] {
  const causes: ClusterCause[] = [];

  for (const component of connectedComponents(nodeIds, edges)) {
    if (component.length < MIN_CLUSTER_SIZE) continue;
    const covering = coveringOrgs(component, edges);
    const topOrgs = topSharedOrgs(component, edges);
    if (covering.length > 0) {
      const winner = covering[0];
      causes.push({
        id: `org:${winner.id}:${component.join(",")}`,
        kind: "org",
        label: winner.label,
        orgId: winner.id,
        memberIds: component,
        topOrgs: [winner],
      });
      continue;
    }
    causes.push({
      id: `mixed:${component.join(",")}`,
      kind: "mixed",
      label: MIXED_BOARDS_LABEL,
      orgId: null,
      memberIds: component,
      topOrgs,
    });
  }

  return causes.sort((a, b) => {
    if (b.memberIds.length !== a.memberIds.length) {
      return b.memberIds.length - a.memberIds.length;
    }
    return a.label.localeCompare(b.label) || a.id.localeCompare(b.id);
  });
}

export function clusterLabelText(cause: ClusterCause): string {
  return cause.kind === "org" ? cause.label : MIXED_BOARDS_LABEL;
}

export interface Point {
  x: number;
  y: number;
}

export function clusterCentroid(points: readonly Point[]): Point | null {
  if (points.length === 0) return null;
  const sum = points.reduce(
    (acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }),
    { x: 0, y: 0 }
  );
  return { x: sum.x / points.length, y: sum.y / points.length };
}

/** Open middle of the group — centroid, nudged off any member that sits on it. */
export function clusterLabelAnchor(
  points: readonly Point[],
  nodeClearance = 16
): Point | null {
  const center = clusterCentroid(points);
  if (!center) return null;
  let nearest: Point | null = null;
  let nearestDist = Infinity;
  for (const point of points) {
    const dist = Math.hypot(point.x - center.x, point.y - center.y);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearest = point;
    }
  }
  if (!nearest || nearestDist >= nodeClearance) return center;
  if (nearestDist < 0.001) {
    return { x: center.x, y: center.y - nodeClearance };
  }
  const scale = (nodeClearance - nearestDist) / nearestDist;
  return {
    x: center.x + (center.x - nearest.x) * scale,
    y: center.y + (center.y - nearest.y) * scale,
  };
}

export function clusterRadius(points: readonly Point[], pad = 28): number {
  const center = clusterCentroid(points);
  if (!center) return pad;
  let max = 0;
  for (const point of points) {
    max = Math.max(max, Math.hypot(point.x - center.x, point.y - center.y));
  }
  return max + pad;
}

export interface ClearancePoint extends Point {
  size?: number;
}

/** Keep the pill in the open middle — never parked on a node disc. */
export function nudgePointOffNodes(
  start: Point,
  nodes: readonly ClearancePoint[],
  gap = 14
): Point {
  let { x, y } = start;
  for (let step = 0; step < 4; step += 1) {
    let nearest: ClearancePoint | null = null;
    let nearestDist = Infinity;
    let nearestClear = gap;
    for (const node of nodes) {
      const clear = (node.size ?? 8) + gap;
      const dist = Math.hypot(x - node.x, y - node.y);
      if (dist < clear && dist < nearestDist) {
        nearest = node;
        nearestDist = dist;
        nearestClear = clear;
      }
    }
    if (!nearest) break;
    if (nearestDist < 0.001) {
      y -= nearestClear;
      continue;
    }
    const scale = (nearestClear - nearestDist) / nearestDist;
    x += (x - nearest.x) * scale;
    y += (y - nearest.y) * scale;
  }
  return { x, y };
}
