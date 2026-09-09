import type { SharedEntity } from "./civic-graph";
import type { GraphRangeStop } from "./graph-range";

export const MIXED_BOARDS_LABEL = "Mixed boards";
export const CLUSTER_LABEL_INK = "#1A2420";
export const CLUSTER_LABEL_SIZE_PX = 11;
export const CLUSTER_WASH_OPACITY = 0.12;
export const CLUSTER_MIXED_STROKE = "#C9C5B8";
/** Detect a sitting group at 3. Pairs are not groups. */
export const MIN_CLUSTER_SIZE = 3;
/**
 * Floor for a title. A pair or trio never gets a pill.
 * Separate from the stand-apart test — do not raise this to 10.
 */
export const MIN_NAMED_CLUSTER_SIZE = 5;
/** Wash is ground only. Never lifted over lines. Never used as an edge tint. */
export const CLUSTER_WASH_IS_GROUND = true;

export type ClusterGraphKind = "people" | "organization";

/**
 * People Wider and All: on. Organizations All: on.
 * Organizations Wider, Most involved: off.
 */
export function clusterCauseOnStop(
  stop: GraphRangeStop,
  kind: ClusterGraphKind = "people"
): boolean {
  if (stop === "most") return false;
  if (kind === "organization") return stop === "all";
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
      /** Several small sitting groups folded into one heading. */
      folded: boolean;
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
  n?: number
): ClusterOrg[] {
  const stats = orgStatsForMembers(memberIds, edges);
  return n == null ? stats : stats.slice(0, n);
}

/** Cream wash only on a named org group. Mixed boards has none. */
export function clusterCauseHasWash(cause: ClusterCause): boolean {
  return cause.kind === "org";
}

/**
 * A sitting group stands apart when it is not the whole drawing and
 * most of its links stay inside, not out into the rest.
 * Buried in the middle mass: no pill, even at 10 or 20 people.
 */
export function clusterStandsApart(
  memberIds: readonly string[],
  nodeIds: readonly string[],
  edges: readonly ClusterEdge[]
): boolean {
  if (memberIds.length === 0) return false;
  const members = new Set(memberIds);
  if (nodeIds.every((id) => members.has(id))) return false;
  let internal = 0;
  let cut = 0;
  const seen = new Set<string>();
  for (const edge of edges) {
    if (edge.source === edge.target) continue;
    const key = edgeKey(edge.source, edge.target);
    if (seen.has(key)) continue;
    seen.add(key);
    const a = members.has(edge.source);
    const b = members.has(edge.target);
    if (a && b) internal += 1;
    else if (a || b) cut += 1;
  }
  if (internal === 0) return false;
  return internal > cut;
}

export function coveringOrgs(
  memberIds: readonly string[],
  edges: readonly ClusterEdge[]
): ClusterOrg[] {
  const size = memberIds.length;
  return orgStatsForMembers(memberIds, edges).filter((org) => org.people >= size);
}

/** Unique undirected edges among the given nodes. */
function uniqueUndirectedEdges(
  nodeIds: readonly string[],
  edges: readonly ClusterEdge[]
): Array<{ source: string; target: string; key: string }> {
  const idSet = new Set(nodeIds);
  const seen = new Set<string>();
  const unique: Array<{ source: string; target: string; key: string }> = [];
  for (const edge of edges) {
    if (!idSet.has(edge.source) || !idSet.has(edge.target)) continue;
    if (edge.source === edge.target) continue;
    const key = edgeKey(edge.source, edge.target);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push({ source: edge.source, target: edge.target, key });
  }
  return unique;
}

function adjacencyList(
  nodeIds: readonly string[],
  pairs: readonly { source: string; target: string }[]
): Map<string, string[]> {
  const adj = new Map<string, string[]>();
  for (const id of nodeIds) adj.set(id, []);
  for (const pair of pairs) {
    adj.get(pair.source)?.push(pair.target);
    adj.get(pair.target)?.push(pair.source);
  }
  return adj;
}

/** Edges whose removal splits a sitting group. */
export function findBridgeKeys(
  nodeIds: readonly string[],
  edges: readonly ClusterEdge[]
): Set<string> {
  const pairs = uniqueUndirectedEdges(nodeIds, edges);
  const adj = adjacencyList(nodeIds, pairs);
  const disc = new Map<string, number>();
  const low = new Map<string, number>();
  const parent = new Map<string, string | null>();
  const bridges = new Set<string>();
  let time = 0;

  const visit = (u: string) => {
    time += 1;
    disc.set(u, time);
    low.set(u, time);
    for (const v of adj.get(u) ?? []) {
      if (!disc.has(v)) {
        parent.set(v, u);
        visit(v);
        low.set(u, Math.min(low.get(u) ?? time, low.get(v) ?? time));
        if ((low.get(v) ?? 0) > (disc.get(u) ?? 0)) {
          bridges.add(edgeKey(u, v));
        }
      } else if (v !== parent.get(u)) {
        low.set(u, Math.min(low.get(u) ?? time, disc.get(v) ?? time));
      }
    }
  };

  for (const id of nodeIds) {
    if (!disc.has(id)) {
      parent.set(id, null);
      visit(id);
    }
  }
  return bridges;
}

/**
 * Groups that remain after thin bridges are removed.
 * A bridge edge must not merge two sitting groups.
 */
export function twoEdgeConnectedComponents(
  nodeIds: readonly string[],
  edges: readonly ClusterEdge[]
): string[][] {
  const bridges = findBridgeKeys(nodeIds, edges);
  const pairs = uniqueUndirectedEdges(nodeIds, edges).filter(
    (pair) => !bridges.has(pair.key)
  );
  return connectedComponents(nodeIds, pairs);
}

/**
 * Org that covers the most members, or the most internal edges on a tie.
 * No unique plurality → not dominant.
 */
export function dominantOrg(stats: readonly ClusterOrg[]): ClusterOrg | null {
  if (stats.length === 0) return null;
  const [first, second] = stats;
  if (!second) return first;
  if (first.people > second.people) return first;
  if (first.people === second.people && first.edges > second.edges) {
    return first;
  }
  return null;
}

function memberSetKey(memberIds: readonly string[]): string {
  return memberIds.slice().sort().join(",");
}

function isMemberSubset(
  inner: readonly string[],
  outer: readonly string[]
): boolean {
  if (inner.length > outer.length) return false;
  const set = new Set(outer);
  return inner.every((id) => set.has(id));
}

export interface SittingGroup {
  memberIds: string[];
}

/**
 * Drop a sitting group whose members are inside a larger one.
 * Equal member sets keep a single group; naming uses dominance.
 */
export function pruneNestedSittingGroups<T extends SittingGroup>(
  groups: readonly T[]
): T[] {
  const sorted = groups.slice().sort((a, b) => {
    if (b.memberIds.length !== a.memberIds.length) {
      return b.memberIds.length - a.memberIds.length;
    }
    return memberSetKey(a.memberIds).localeCompare(memberSetKey(b.memberIds));
  });
  const kept: T[] = [];
  for (const group of sorted) {
    if (kept.some((other) => isMemberSubset(group.memberIds, other.memberIds))) {
      continue;
    }
    kept.push(group);
  }
  return kept;
}

function edgesForOrg(
  edges: readonly ClusterEdge[],
  orgId: string
): ClusterEdge[] {
  return edges.filter((edge) => orgsOnEdge(edge).some((org) => org.id === orgId));
}

function orgsOnDrawnEdges(
  nodeIds: readonly string[],
  edges: readonly ClusterEdge[]
): Array<{ id: string; label: string }> {
  const idSet = new Set(nodeIds);
  const labels = new Map<string, string>();
  for (const edge of edges) {
    if (!idSet.has(edge.source) || !idSet.has(edge.target)) continue;
    if (edge.source === edge.target) continue;
    for (const org of orgsOnEdge(edge)) {
      if (!org.id || labels.has(org.id)) continue;
      labels.set(org.id, org.label);
    }
  }
  return Array.from(labels.entries()).map(([id, label]) => ({ id, label }));
}

/**
 * Groups that sit together on one org. A thin bridge of another org
 * does not merge them. Nested subsets are dropped so one blob gets one pill.
 */
export function orgSittingGroups(
  nodeIds: readonly string[],
  edges: readonly ClusterEdge[]
): SittingGroup[] {
  const groups: SittingGroup[] = [];
  for (const org of orgsOnDrawnEdges(nodeIds, edges)) {
    const orgEdges = edgesForOrg(edges, org.id);
    const members = new Set<string>();
    const idSet = new Set(nodeIds);
    for (const edge of orgEdges) {
      if (!idSet.has(edge.source) || !idSet.has(edge.target)) continue;
      if (edge.source === edge.target) continue;
      members.add(edge.source);
      members.add(edge.target);
    }
    for (const component of connectedComponents(Array.from(members), orgEdges)) {
      if (component.length < MIN_CLUSTER_SIZE) continue;
      groups.push({ memberIds: component });
    }
  }
  return pruneNestedSittingGroups(groups);
}

function uniqueMemberIds(groups: readonly (readonly string[])[]): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const group of groups) {
    for (const id of group) {
      if (seen.has(id)) continue;
      seen.add(id);
      ids.push(id);
    }
  }
  return ids.sort();
}

function mergeOrgStats(orgs: readonly ClusterOrg[]): ClusterOrg[] {
  const byId = new Map<string, ClusterOrg>();
  for (const org of orgs) {
    const prev = byId.get(org.id);
    if (
      !prev ||
      org.people > prev.people ||
      (org.people === prev.people && org.edges > prev.edges)
    ) {
      byId.set(org.id, org);
    }
  }
  return Array.from(byId.values()).sort((a, b) => {
    if (b.people !== a.people) return b.people - a.people;
    if (b.edges !== a.edges) return b.edges - a.edges;
    return a.label.localeCompare(b.label) || a.id.localeCompare(b.id);
  });
}

/**
 * Orgs that belong to the folded small groups. Skip an org that already
 * has a named pill so the Mixed boards list is the hidden boards.
 */
function orgsForFoldedGroups(
  groups: readonly (readonly string[])[],
  edges: readonly ClusterEdge[],
  excludeOrgIds: ReadonlySet<string>
): ClusterOrg[] {
  const picked: ClusterOrg[] = [];
  for (const members of groups) {
    const stats = orgStatsForMembers(members, edges).filter(
      (org) => !excludeOrgIds.has(org.id)
    );
    if (stats.length === 0) continue;
    const winner = dominantOrg(stats);
    if (winner) picked.push(winner);
    else picked.push(...stats);
  }
  return mergeOrgStats(picked);
}

function mixedCauseFromGroups(
  groups: readonly (readonly string[])[],
  edges: readonly ClusterEdge[],
  options: {
    excludeOrgIds?: ReadonlySet<string>;
    excludeMemberIds?: ReadonlySet<string>;
  } = {}
): ClusterCause {
  const excludeOrgIds = options.excludeOrgIds ?? new Set<string>();
  const allMembers = uniqueMemberIds(groups);
  const ownMembers = options.excludeMemberIds
    ? allMembers.filter((id) => !options.excludeMemberIds!.has(id))
    : allMembers;
  const memberIds = ownMembers.length > 0 ? ownMembers : allMembers;
  const topOrgs =
    groups.length > 1 || excludeOrgIds.size > 0
      ? orgsForFoldedGroups(groups, edges, excludeOrgIds)
      : orgStatsForMembers(memberIds, edges).filter(
          (org) => !excludeOrgIds.has(org.id)
        );
  return {
    id: `mixed:${memberIds.join(",")}`,
    kind: "mixed",
    label: MIXED_BOARDS_LABEL,
    orgId: null,
    memberIds,
    topOrgs,
    folded: groups.length > 1,
  };
}

function causeFromMembers(
  memberIds: string[],
  edges: readonly ClusterEdge[]
): ClusterCause {
  const stats = orgStatsForMembers(memberIds, edges);
  const winner = dominantOrg(stats);
  if (winner && memberIds.length >= MIN_NAMED_CLUSTER_SIZE) {
    return {
      id: `org:${winner.id}:${memberIds.join(",")}`,
      kind: "org",
      label: winner.label,
      orgId: winner.id,
      memberIds,
      topOrgs: [winner],
    };
  }
  return {
    id: `mixed:${memberIds.join(",")}`,
    kind: "mixed",
    label: MIXED_BOARDS_LABEL,
    orgId: null,
    memberIds,
    topOrgs: stats,
    folded: false,
  };
}

export interface BuildClusterCausesOptions {
  /**
   * Chip list only. Pills never dump the unlabeled mass into Mixed boards.
   * Default is stand-apart: no heading when nothing stands out.
   */
  foldUnlabeled?: boolean;
}

/**
 * Split the drawn graph into the groups that sit together.
 * A named pill needs the size floor and a group that stands apart
 * (most links stay inside). Mixed boards only for a stand-apart
 * group with no dominant org — not a dump of the unlabeled mass.
 * A thin bridge must not merge separable groups.
 */
export function buildClusterCauses(
  nodeIds: readonly string[],
  edges: readonly ClusterEdge[],
  options: BuildClusterCausesOptions = {}
): ClusterCause[] {
  const sitting = orgSittingGroups(nodeIds, edges);
  const named: ClusterCause[] = [];
  const fold: string[][] = [];
  const foldUnlabeled = Boolean(options.foldUnlabeled);

  const consider = (
    memberIds: string[],
    groupEdges: readonly ClusterEdge[]
  ) => {
    if (memberIds.length < MIN_CLUSTER_SIZE) return;
    if (foldUnlabeled) {
      if (memberIds.length >= MIN_NAMED_CLUSTER_SIZE) {
        const cause = causeFromMembers(memberIds, groupEdges);
        if (cause.kind === "org") {
          named.push(cause);
          return;
        }
      }
      fold.push(memberIds);
      return;
    }
    if (memberIds.length < MIN_NAMED_CLUSTER_SIZE) return;
    if (!clusterStandsApart(memberIds, nodeIds, edges)) return;
    const cause = causeFromMembers(memberIds, groupEdges);
    if (cause.kind === "org") named.push(cause);
    else fold.push(memberIds);
  };

  for (const group of sitting) {
    consider(group.memberIds, edges);
  }

  const assigned = new Set<string>();
  for (const group of sitting) {
    for (const id of group.memberIds) assigned.add(id);
  }

  const leftover = nodeIds.filter((id) => !assigned.has(id));
  const leftoverEdges = edges.filter(
    (edge) => !assigned.has(edge.source) && !assigned.has(edge.target)
  );
  for (const piece of twoEdgeConnectedComponents(leftover, leftoverEdges)) {
    consider(piece, leftoverEdges);
  }

  const causes = named.slice();
  if (fold.length > 0) {
    const excludeOrgIds = new Set(
      named
        .map((cause) => cause.orgId)
        .filter((id): id is string => Boolean(id))
    );
    const excludeMemberIds = new Set(named.flatMap((cause) => cause.memberIds));
    causes.push(
      mixedCauseFromGroups(fold, edges, { excludeOrgIds, excludeMemberIds })
    );
  }

  return causes.sort((a, b) => {
    if (b.memberIds.length !== a.memberIds.length) {
      return b.memberIds.length - a.memberIds.length;
    }
    return a.label.localeCompare(b.label) || a.id.localeCompare(b.id);
  });
}

/** Full org name for the pill. Do not pre-truncate. */
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
