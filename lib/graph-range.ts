export type GraphRangeStop = "most" | "wider" | "all";

export const GRAPH_RANGE_LABELS: Record<GraphRangeStop, string> = {
  most: "Most involved",
  wider: "Wider",
  all: "All",
};

export const GRAPH_RANGE_MOST = 12;
export const GRAPH_RANGE_WIDER = 24;

export function graphRangeCap(stop: GraphRangeStop): number {
  if (stop === "most") return GRAPH_RANGE_MOST;
  if (stop === "wider") return GRAPH_RANGE_WIDER;
  return Number.POSITIVE_INFINITY;
}

export function drawnCountForStop(
  connectedCount: number,
  stop: GraphRangeStop
): number {
  return Math.min(Math.max(connectedCount, 0), graphRangeCap(stop));
}

/** Hide a stop only when it would draw the same set as the previous one. */
export function visibleGraphRangeStops(
  connectedCount: number
): GraphRangeStop[] {
  const stops: GraphRangeStop[] = ["most"];
  const mostN = drawnCountForStop(connectedCount, "most");
  const widerN = drawnCountForStop(connectedCount, "wider");
  if (widerN > mostN) stops.push("wider");
  if (connectedCount > widerN) stops.push("all");
  return stops;
}

export function resolveGraphRangeStop(
  stop: GraphRangeStop,
  connectedCount: number
): GraphRangeStop {
  const visible = visibleGraphRangeStops(connectedCount);
  if (visible.includes(stop)) return stop;
  return visible[visible.length - 1] ?? "most";
}

export function rangeMetaLine(drawn: number, connected: number): string {
  return `${drawn} of ${connected} on the graph. The list still has everyone.`;
}

export function rankByFootprint<T extends { id: string; footprint: number }>(
  nodes: T[]
): T[] {
  return nodes.slice().sort((a, b) => {
    if (b.footprint !== a.footprint) return b.footprint - a.footprint;
    return a.id.localeCompare(b.id);
  });
}

/**
 * Take the top N of the connected set by footprint, then keep edges among
 * those nodes. When `dropIsolates` is true, a node in the band with no edge
 * inside the drawn set stays off the graph — no backfill.
 */
export function sliceConnectedByFootprint<
  N extends { id: string; footprint: number },
  E extends { source: string; target: string },
>(
  nodes: N[],
  edges: E[],
  stop: GraphRangeStop,
  options: { dropIsolates?: boolean } = {}
): { nodes: N[]; edges: E[] } {
  const cap = graphRangeCap(stop);
  const band = new Set(rankByFootprint(nodes).slice(0, cap).map((node) => node.id));
  const keptEdges = edges.filter(
    (edge) => band.has(edge.source) && band.has(edge.target)
  );
  if (!options.dropIsolates) {
    return {
      nodes: nodes.filter((node) => band.has(node.id)),
      edges: keptEdges,
    };
  }
  const drawn = new Set<string>();
  for (const edge of keptEdges) {
    drawn.add(edge.source);
    drawn.add(edge.target);
  }
  return {
    nodes: nodes.filter((node) => drawn.has(node.id)),
    edges: keptEdges,
  };
}
