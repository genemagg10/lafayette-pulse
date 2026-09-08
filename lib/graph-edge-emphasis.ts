/** Locked Who-graph edge emphasis. No new hue. Wash stays ground. */

export const EMPHASIZED_EDGE_COLOR = "#1A2420";
/** Extra space so the ink meets the node edge and stops. Nodes stay above the line. */
export const EMPHASIZED_EDGE_ENDPOINT_GAP_PX = 1;
/** Compressive bump: thin lines gain more, thick lines only a little. No hard floor. */
export const EMPHASIZED_EDGE_SIZE_BUMP = 0.45;

/**
 * Overlay paint order for Who people/org graphs.
 * Wash is ground. The ink stroke sits on it. The cream pill sits on the stroke.
 */
export const WHO_EDGE_OVERLAY_ORDER = [
  "cluster-wash",
  "emphasized-ink",
  "cluster-pill",
] as const;

export type WhoNodeShape = "circle" | "square" | "diamond";

export interface EdgePair {
  source: string;
  target: string;
}

export interface KeyedEdgePair extends EdgePair {
  key: string;
}

export interface EmphasizedEndpoint {
  x: number;
  y: number;
}

export interface EmphasizedNodeCap {
  size: number;
  shape?: WhoNodeShape | string | null;
}

export function whoNodeShape(type: string | null | undefined): WhoNodeShape {
  if (type === "square" || type === "diamond") return type;
  return "circle";
}

/**
 * Slightly larger than the original. factor = 1 + 0.45 / (1 + baseSize).
 * No 2.4 floor — a thick line must not gain a fat constant width.
 */
export function emphasizeEdgeSizeFactor(baseSize: number): number {
  const base = Number.isFinite(baseSize) && baseSize > 0 ? baseSize : 1.4;
  return 1 + EMPHASIZED_EDGE_SIZE_BUMP / (1 + base);
}

export function emphasizeEdgeSize(baseSize: number): number {
  const base = Number.isFinite(baseSize) && baseSize > 0 ? baseSize : 1.4;
  return base * emphasizeEdgeSizeFactor(base);
}

/** Ink only. Never the cluster wash, never a per-org tint. */
export function emphasizedEdgeStroke(_clusterWash?: string | null): string {
  return EMPHASIZED_EDGE_COLOR;
}

/**
 * Distance from the node center to the drawn shape edge along a ray.
 * Circle, square, and diamond use the same Sigma size (half-side / radius).
 */
export function nodeExtentAlongRay(
  shape: WhoNodeShape,
  radius: number,
  dx: number,
  dy: number
): number {
  const size = Number.isFinite(radius) && radius > 0 ? radius : 0;
  const length = Math.hypot(dx, dy);
  if (size === 0) return 0;
  if (length === 0) return size;
  const ux = dx / length;
  const uy = dy / length;
  if (shape === "square") {
    const m = Math.max(Math.abs(ux), Math.abs(uy));
    return m > 0 ? size / m : size;
  }
  if (shape === "diamond") {
    const m = Math.abs(ux) + Math.abs(uy);
    return m > 0 ? (size * Math.SQRT2) / m : size;
  }
  return size;
}

/**
 * Pull each end back by that shape's drawn radius plus a 1px gap
 * so the stroke meets the disc/square/diamond and does not paint across it.
 */
export function shortenEmphasizedStroke(
  from: EmphasizedEndpoint,
  to: EmphasizedEndpoint,
  source: EmphasizedNodeCap,
  target: EmphasizedNodeCap,
  gap = EMPHASIZED_EDGE_ENDPOINT_GAP_PX
): { from: EmphasizedEndpoint; to: EmphasizedEndpoint } | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  const startCut =
    nodeExtentAlongRay(whoNodeShape(source.shape), source.size, dx, dy) + gap;
  const endCut =
    nodeExtentAlongRay(whoNodeShape(target.shape), target.size, -dx, -dy) + gap;
  if (!Number.isFinite(length) || length <= startCut + endCut) return null;
  const ux = dx / length;
  const uy = dy / length;
  return {
    from: { x: from.x + ux * startCut, y: from.y + uy * startCut },
    to: { x: to.x - ux * endCut, y: to.y - uy * endCut },
  };
}

export function edgeMatchesPair(
  source: string,
  target: string,
  pair: EdgePair | null | undefined
): boolean {
  if (!pair) return false;
  return (
    (source === pair.source && target === pair.target) ||
    (source === pair.target && target === pair.source)
  );
}

/**
 * One edge at a time. Hover previews; otherwise the selected pair holds.
 * Bind to the existing selected-edge / pair-label state — no second model.
 */
export function activeEmphasizedEdgeKey(options: {
  hoveredKey: string | null | undefined;
  selectedPair: EdgePair | null | undefined;
  edges: readonly KeyedEdgePair[];
}): string | null {
  if (options.hoveredKey) return options.hoveredKey;
  if (!options.selectedPair) return null;
  const match = options.edges.find((edge) =>
    edgeMatchesPair(edge.source, edge.target, options.selectedPair)
  );
  return match?.key ?? null;
}
