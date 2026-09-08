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

export type GraphLabelMode = "focus" | "all" | "hover";
export type WhoHoverShape = "circle" | "square" | "diamond";

/** Stroke the node shape only. No chip, no second copy of the name. */
export function drawWhoHoverRing(
  ctx: CanvasRenderingContext2D,
  node: { x: number; y: number; size: number },
  shape: WhoHoverShape
): void {
  const radius = node.size + 2;
  ctx.save();
  ctx.strokeStyle = "#243324";
  ctx.lineWidth = 2;
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.beginPath();
  if (shape === "square") {
    ctx.rect(node.x - radius, node.y - radius, radius * 2, radius * 2);
  } else if (shape === "diamond") {
    ctx.translate(node.x, node.y);
    ctx.rotate(Math.PI / 4);
    ctx.rect(-radius, -radius, radius * 2, radius * 2);
  } else {
    ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
  }
  ctx.stroke();
  ctx.restore();
}

/**
 * Gene override: Who graphs name every drawn object on every width stop.
 * Hover / top 6 / Focus no longer hide names. Line-click pair filtering
 * is handled separately by visibleWhoLabelIds.
 */
export function labelModeForWidthStop(
  _stop: "most" | "wider" | "all"
): GraphLabelMode {
  return "all";
}

/** Default: every drawn object. Clicked connection: the two endpoints only. */
export function visibleWhoLabelIds(options: {
  nodeIds: readonly string[];
  selectedEdgeEndpoints?: readonly string[] | null;
}): Set<string> {
  const pair = options.selectedEdgeEndpoints;
  if (pair && pair.length > 0) return new Set(pair);
  return new Set(options.nodeIds);
}

export const FOCUS_LABEL_TOP_N = 6;
/** Conflict ribbon: label every actor when the cast is this small. */
export const FOCUS_LABEL_ALL_ACTORS_MAX = 12;
export const GRAPH_LABEL_MAX_CHARS = 28;

export interface LabelRankNode {
  id: string;
  degree?: number;
  member_count?: number;
  footprint?: number;
}

export function nodeFocusRank(node: LabelRankNode): number {
  if (typeof node.footprint === "number") return node.footprint;
  if (typeof node.member_count === "number") return node.member_count;
  return node.degree ?? 0;
}

export function truncateGraphLabel(
  label: string,
  max = GRAPH_LABEL_MAX_CHARS
): string {
  const trimmed = label.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max).trimEnd()}…`;
}

export interface LabelBox {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rank: number;
}

export function labelBoxesOverlap(
  a: LabelBox,
  b: LabelBox,
  pad = 2
): boolean {
  return !(
    a.x + a.w + pad < b.x ||
    b.x + b.w + pad < a.x ||
    a.y + a.h + pad < b.y ||
    b.y + b.h + pad < a.y
  );
}

export interface LabelOffset {
  dx: number;
  dy: number;
}

const LABEL_OFFSET_STEPS: LabelOffset[] = [
  { dx: 0, dy: 0 },
  { dx: 0, dy: -14 },
  { dx: 0, dy: 14 },
  { dx: 0, dy: -28 },
  { dx: 0, dy: 28 },
  { dx: 12, dy: -14 },
  { dx: 12, dy: 14 },
  { dx: -10, dy: -14 },
  { dx: -10, dy: 14 },
  { dx: 0, dy: -42 },
  { dx: 0, dy: 42 },
];

/**
 * Keep every name. Higher-footprint labels stay put; others slide to a
 * free slot. A name is never dropped to keep the graph quiet.
 */
export function offsetCollidingLabels(boxes: LabelBox[]): Map<string, LabelOffset> {
  const byRank = boxes.slice().sort((a, b) => {
    if (b.rank !== a.rank) return b.rank - a.rank;
    return a.id.localeCompare(b.id);
  });
  const placed: LabelBox[] = [];
  const offsets = new Map<string, LabelOffset>();
  for (const box of byRank) {
    let chosen = LABEL_OFFSET_STEPS[LABEL_OFFSET_STEPS.length - 1];
    for (const candidate of LABEL_OFFSET_STEPS) {
      const moved = {
        ...box,
        x: box.x + candidate.dx,
        y: box.y + candidate.dy,
      };
      if (!placed.some((other) => labelBoxesOverlap(other, moved))) {
        chosen = candidate;
        break;
      }
    }
    offsets.set(box.id, chosen);
    placed.push({
      ...box,
      x: box.x + chosen.dx,
      y: box.y + chosen.dy,
    });
  }
  return offsets;
}

/** Keep higher-footprint labels; pinned ids (hover/selected) win ties. */
export function dropCollidingLabels(
  boxes: LabelBox[],
  pinnedIds?: Iterable<string>
): Set<string> {
  const pinned = new Set(pinnedIds ?? []);
  const byRank = (a: LabelBox, b: LabelBox) => {
    if (b.rank !== a.rank) return b.rank - a.rank;
    return a.id.localeCompare(b.id);
  };
  const first = boxes.filter((box) => pinned.has(box.id)).slice().sort(byRank);
  const rest = boxes.filter((box) => !pinned.has(box.id)).slice().sort(byRank);
  const kept: LabelBox[] = [];
  for (const box of [...first, ...rest]) {
    if (kept.some((other) => labelBoxesOverlap(other, box))) continue;
    kept.push(box);
  }
  return new Set(kept.map((box) => box.id));
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
  if (options.mode === "hover") {
    if (options.hoveredNodeId) visible.add(options.hoveredNodeId);
    for (const id of options.hoveredEdgeEndpoints ?? []) visible.add(id);
    for (const id of options.selectedEdgeEndpoints ?? []) visible.add(id);
    return visible;
  }

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
