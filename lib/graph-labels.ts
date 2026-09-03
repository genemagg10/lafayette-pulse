import type { OrgType } from "./types";

const ORG_TYPE_ORDER: OrgType[] = [
  "city_body",
  "civic",
  "foundation",
  "interest",
  "campaign",
  "other",
];
const ORG_TYPE_SET = new Set<string>(ORG_TYPE_ORDER);

export type GraphLabelMode = "focus" | "all";

export const FOCUS_LABEL_TOP_N = 6;
/** Conflict ribbon: label every actor when the cast is this small. */
export const FOCUS_LABEL_ALL_ACTORS_MAX = 12;

export interface LabelRankNode {
  id: string;
  degree?: number;
  member_count?: number;
}

export function nodeFocusRank(node: LabelRankNode): number {
  if (typeof node.member_count === "number") return node.member_count;
  return node.degree ?? 0;
}

export function degreesFromEdges(
  nodeIds: Iterable<string>,
  edges: Array<{ source: string; target: string }>
): Map<string, number> {
  const ids = new Set(nodeIds);
  const degree = new Map<string, number>();
  ids.forEach((id) => degree.set(id, 0));
  for (const edge of edges) {
    if (!ids.has(edge.source) || !ids.has(edge.target)) continue;
    if (edge.source === edge.target) continue;
    degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
    degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
  }
  return degree;
}

/** Top N nodes by degree (or member_count on affinity), excluding the ego center. */
export function topFocusLabelIds(
  nodes: LabelRankNode[],
  centerId?: string | null,
  n = FOCUS_LABEL_TOP_N
): string[] {
  return nodes
    .filter((node) => node.id !== centerId)
    .slice()
    .sort((a, b) => {
      const diff = nodeFocusRank(b) - nodeFocusRank(a);
      if (diff !== 0) return diff;
      return a.id.localeCompare(b.id);
    })
    .slice(0, n)
    .map((node) => node.id);
}

export function visibleFocusLabelIds(options: {
  mode: GraphLabelMode;
  nodeIds: readonly string[];
  centerId?: string | null;
  hoveredNodeId?: string | null;
  hoveredEdgeEndpoints?: readonly string[] | null;
  selectedEdgeEndpoints?: readonly string[] | null;
  topFocusIds: readonly string[];
  actorIds?: readonly string[];
  labelAllActorsMax?: number;
}): Set<string> {
  if (options.mode === "all") return new Set(options.nodeIds);

  const visible = new Set<string>();
  if (options.centerId) visible.add(options.centerId);

  const actors =
    options.actorIds ??
    options.nodeIds.filter((id) => id !== options.centerId);
  const cap = options.labelAllActorsMax;
  if (typeof cap === "number" && actors.length <= cap) {
    for (const id of options.nodeIds) visible.add(id);
    return visible;
  }

  if (options.hoveredNodeId) visible.add(options.hoveredNodeId);
  for (const id of options.hoveredEdgeEndpoints ?? []) visible.add(id);
  for (const id of options.selectedEdgeEndpoints ?? []) visible.add(id);
  for (const id of options.topFocusIds) visible.add(id);
  return visible;
}

export function presentOrgTypesFromNodes(
  nodes: Array<{ org_type?: OrgType | null }>
): OrgType[] {
  const seen = new Set<OrgType>();
  for (const node of nodes) {
    if (node.org_type && ORG_TYPE_SET.has(node.org_type)) {
      seen.add(node.org_type);
    }
  }
  return ORG_TYPE_ORDER.filter((type) => seen.has(type));
}
