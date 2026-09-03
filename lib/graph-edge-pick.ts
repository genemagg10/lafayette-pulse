/** Viewport-pixel corridor around a stroke. Sigma picking uses the visual
 *  edge width (~1–3px), so mid-edge clicks miss without this. */
export const EDGE_PICK_RADIUS_PX = 16;

export interface ViewportEdge {
  key: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface ViewportNode {
  key: string;
  x: number;
  y: number;
  size: number;
}

export function distanceToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return Math.hypot(px - x1, py - y1);
  const t = Math.max(
    0,
    Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lengthSq)
  );
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

export function pickClosestEdge(
  edges: ViewportEdge[],
  x: number,
  y: number,
  radius = EDGE_PICK_RADIUS_PX
): string | null {
  let bestKey: string | null = null;
  let bestDist = radius;
  for (const edge of edges) {
    const dist = distanceToSegment(x, y, edge.x1, edge.y1, edge.x2, edge.y2);
    if (dist <= bestDist) {
      bestDist = dist;
      bestKey = edge.key;
    }
  }
  return bestKey;
}

/** Prefer a node when the pointer is on its disc so edge hover does not steal it. */
export function pickClosestNode(
  nodes: ViewportNode[],
  x: number,
  y: number
): string | null {
  let bestKey: string | null = null;
  let bestDist = Infinity;
  for (const node of nodes) {
    const dist = Math.hypot(x - node.x, y - node.y);
    if (dist <= node.size && dist < bestDist) {
      bestDist = dist;
      bestKey = node.key;
    }
  }
  return bestKey;
}
