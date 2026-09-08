/** Locked Who-graph edge emphasis. No new hue. Wash stays ground. */

export const EMPHASIZED_EDGE_COLOR = "#1A2420";
/** Same thicken as the existing hover stroke — do not redesign the line. */
export const EMPHASIZED_EDGE_SIZE_FACTOR = 1.6;
export const EMPHASIZED_EDGE_SIZE_MIN = 2.4;

/**
 * Overlay paint order for Who people/org graphs.
 * Wash is ground. The ink stroke sits on it. The cream pill sits on the stroke.
 */
export const WHO_EDGE_OVERLAY_ORDER = [
  "cluster-wash",
  "emphasized-ink",
  "cluster-pill",
] as const;

export interface EdgePair {
  source: string;
  target: string;
}

export interface KeyedEdgePair extends EdgePair {
  key: string;
}

export function emphasizeEdgeSize(baseSize: number): number {
  const base = Number.isFinite(baseSize) && baseSize > 0 ? baseSize : 1.4;
  return Math.max(base * EMPHASIZED_EDGE_SIZE_FACTOR, EMPHASIZED_EDGE_SIZE_MIN);
}

/** Ink only. Never the cluster wash, never a per-org tint. */
export function emphasizedEdgeStroke(_clusterWash?: string | null): string {
  return EMPHASIZED_EDGE_COLOR;
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
