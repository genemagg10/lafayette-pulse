"use client";

import { useEffect, useRef } from "react";
import Graph from "graphology";
import forceAtlas2 from "graphology-layout-forceatlas2";
import circular from "graphology-layout/circular";
import Sigma from "sigma";
import { NodeSquareProgram } from "@sigma/node-square";
import {
  CURRENT_EDGE_COLOR,
  formatTenureRange,
  isCurrentTenure,
  nodeColor,
  nodeType,
  PAST_EDGE_COLOR,
} from "@/lib/civic-graph";
import { NodeDiamondProgram } from "./NodeDiamondProgram";
import type { OrgType, SeatType } from "@/lib/types";

export interface RenderableNode {
  id: string;
  kind: "person" | "organization" | "seat";
  label: string;
  org_type?: OrgType;
  seat_type?: SeatType;
  size?: number;
  color?: string;
  column?: "support" | "oppose" | "endorse" | "measure";
  polarity?: string;
}

export interface RenderableEdge {
  source: string;
  target: string;
  kind?: string;
  role?: string | null;
  is_primary?: boolean;
  start_date?: string | null;
  end_date?: string | null;
  shared?: number;
  jaccard?: number;
  shared_names?: string[];
  color?: string;
  dashed?: boolean;
  polarity?: string;
  stance_kind?: string;
  co_stance?: number;
  opposed?: number;
}

interface CivicGraphProps {
  nodes: RenderableNode[];
  edges: RenderableEdge[];
  centerId?: string | null;
  layout?: "force" | "ribbon";
  heightClassName?: string;
  onNodeClick?: (id: string, kind: RenderableNode["kind"]) => void;
  onEdgeClick?: (edge: RenderableEdge) => void;
}

function radiusForKind(kind: string): number {
  if (kind === "seat") return 58;
  if (kind === "organization") return 128;
  return 186;
}

function layoutRibbon(graph: Graph, centerId?: string | null) {
  const columns: Record<string, string[]> = {
    support: [],
    oppose: [],
    endorse: [],
    measure: [],
  };
  graph.forEachNode((id, attrs) => {
    const column = (attrs.column as string) || (id === centerId ? "measure" : "support");
    (columns[column] || columns.support).push(id);
  });
  const placeColumn = (ids: string[], x: number) => {
    const n = ids.length;
    ids.forEach((id, index) => {
      const y = n === 1 ? 0 : ((index / Math.max(n - 1, 1)) - 0.5) * Math.min(280, 48 * n);
      graph.setNodeAttribute(id, "x", x);
      graph.setNodeAttribute(id, "y", y);
    });
  };
  placeColumn(columns.support, -180);
  placeColumn(columns.oppose, 180);
  placeColumn(columns.endorse, 0);
  if (columns.measure.length > 0) {
    columns.measure.forEach((id, index) => {
      graph.setNodeAttribute(id, "x", 0);
      graph.setNodeAttribute(
        id,
        "y",
        columns.endorse.length > 0 ? 90 + index * 36 : index * 36
      );
    });
  } else if (centerId && graph.hasNode(centerId)) {
    graph.setNodeAttribute(centerId, "x", 0);
    graph.setNodeAttribute(centerId, "y", 90);
  }
}

function layoutGraph(
  graph: Graph,
  centerId?: string | null,
  layout: "force" | "ribbon" = "force"
) {
  if (graph.order === 0) return;
  if (graph.order === 1) {
    const id = graph.nodes()[0];
    graph.setNodeAttribute(id, "x", 0);
    graph.setNodeAttribute(id, "y", 0);
    return;
  }

  if (layout === "ribbon") {
    layoutRibbon(graph, centerId);
    return;
  }

  circular.assign(graph, { scale: 80 });

  if (centerId && graph.hasNode(centerId)) {
    graph.setNodeAttribute(centerId, "x", 0);
    graph.setNodeAttribute(centerId, "y", 0);
    const rings: Record<string, string[]> = {
      seat: [],
      organization: [],
      person: [],
    };
    graph.forEachNode((id, attrs) => {
      if (id === centerId) return;
      const kind = (attrs.kind as string) || "person";
      (rings[kind] || rings.person).push(id);
    });
    const place = (ids: string[], radius: number, angleOffset = 0) => {
      ids.forEach((id, index) => {
        const angle =
          (2 * Math.PI * index) / Math.max(ids.length, 1) - Math.PI / 2 + angleOffset;
        graph.setNodeAttribute(id, "x", Math.cos(angle) * radius);
        graph.setNodeAttribute(id, "y", Math.sin(angle) * radius);
      });
    };
    // Offset rings so the Mayor diamond is not on the same ray as City Council.
    place(rings.seat, radiusForKind("seat"), 0);
    place(
      rings.organization,
      radiusForKind("organization"),
      Math.PI / Math.max(rings.organization.length * 2, 3)
    );
    place(rings.person, radiusForKind("person"), Math.PI / 8);

    forceAtlas2.assign(graph, {
      iterations: 20,
      settings: {
        ...forceAtlas2.inferSettings(graph),
        gravity: 0.35,
        scalingRatio: 16,
        strongGravityMode: false,
        adjustSizes: true,
        barnesHutOptimize: graph.order > 40,
      },
    });

    graph.setNodeAttribute(centerId, "x", 0);
    graph.setNodeAttribute(centerId, "y", 0);
    graph.forEachNode((id, attrs) => {
      if (id === centerId) return;
      const x = Number(attrs.x) || 0;
      const y = Number(attrs.y) || 0;
      const dist = Math.hypot(x, y);
      if (dist < 0.001) return;
      const r = radiusForKind((attrs.kind as string) || "person");
      graph.setNodeAttribute(id, "x", (x / dist) * r);
      graph.setNodeAttribute(id, "y", (y / dist) * r);
    });
    return;
  }

  forceAtlas2.assign(graph, {
    iterations: graph.order > 8 ? 80 : 40,
    settings: {
      ...forceAtlas2.inferSettings(graph),
      gravity: 1.2,
      scalingRatio: 8,
      strongGravityMode: true,
      barnesHutOptimize: graph.order > 40,
    },
  });
}

function edgeFromAttrs(
  source: string,
  target: string,
  attrs: Record<string, unknown>
): RenderableEdge {
  return {
    source,
    target,
    kind: typeof attrs.kind === "string" ? attrs.kind : undefined,
    role: typeof attrs.role === "string" ? attrs.role : attrs.role === null ? null : undefined,
    is_primary: Boolean(attrs.is_primary),
    start_date:
      typeof attrs.start_date === "string" || attrs.start_date === null
        ? (attrs.start_date as string | null)
        : undefined,
    end_date:
      typeof attrs.end_date === "string" || attrs.end_date === null
        ? (attrs.end_date as string | null)
        : undefined,
    shared: typeof attrs.shared === "number" ? attrs.shared : undefined,
    jaccard: typeof attrs.jaccard === "number" ? attrs.jaccard : undefined,
    shared_names: Array.isArray(attrs.shared_names)
      ? attrs.shared_names.filter((name): name is string => typeof name === "string")
      : undefined,
    color: typeof attrs.color === "string" ? attrs.color : undefined,
    dashed: Boolean(attrs.dashed),
    polarity: typeof attrs.polarity === "string" ? attrs.polarity : undefined,
    stance_kind: typeof attrs.stance_kind === "string" ? attrs.stance_kind : undefined,
    co_stance: typeof attrs.co_stance === "number" ? attrs.co_stance : undefined,
    opposed: typeof attrs.opposed === "number" ? attrs.opposed : undefined,
  };
}

function tooltipLines(edge: RenderableEdge): string[] {
  if (edge.stance_kind || edge.polarity || edge.co_stance != null || edge.opposed != null) {
    const lines: string[] = [];
    if (edge.stance_kind === "co-stance" || (edge.co_stance != null && (edge.opposed ?? 0) <= (edge.co_stance ?? 0))) {
      lines.push("Co-stance");
    } else if (edge.stance_kind === "opposed-on-issues" || (edge.opposed ?? 0) > 0) {
      lines.push("Opposed on issues");
    } else if (edge.polarity === "support") {
      lines.push("Support");
    } else if (edge.polarity === "oppose") {
      lines.push("Oppose");
    } else if (edge.polarity === "endorse") {
      lines.push("Endorse");
    }
    if (edge.co_stance != null) {
      lines.push(`${edge.co_stance} co-stance`);
    }
    if (edge.opposed != null) {
      lines.push(`${edge.opposed} opposed on issues`);
    }
    if (edge.shared != null && edge.co_stance == null) {
      lines.push(`${edge.shared} shared issue${edge.shared === 1 ? "" : "s"}`);
    }
    return lines;
  }
  if (edge.shared != null || edge.jaccard != null) {
    const lines: string[] = [];
    if (edge.shared != null) {
      lines.push(
        `${edge.shared} shared member${edge.shared === 1 ? "" : "s"}`
      );
    }
    if (edge.jaccard != null) {
      lines.push(`Jaccard ${edge.jaccard.toFixed(2)}`);
    }
    return lines;
  }
  const role =
    edge.role || (edge.kind === "seat_holder" ? "Seat" : "Member");
  return [role, formatTenureRange(edge.start_date, edge.end_date)];
}

export default function CivicGraph({
  nodes,
  edges,
  centerId,
  layout = "force",
  heightClassName = "h-[320px] sm:h-[380px]",
  onNodeClick,
  onEdgeClick,
}: CivicGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const lastMouseRef = useRef({ x: 0, y: 0 });
  const clickRef = useRef(onNodeClick);
  clickRef.current = onNodeClick;
  const edgeClickRef = useRef(onEdgeClick);
  edgeClickRef.current = onEdgeClick;

  useEffect(() => {
    const container = containerRef.current;
    const overlay = overlayRef.current;
    const tooltip = tooltipRef.current;
    if (!container) return;

    const graph = new Graph({ multi: true, type: "undirected" });
    for (const node of nodes) {
      if (graph.hasNode(node.id)) continue;
      const kind = node.kind;
      graph.addNode(node.id, {
        label: node.label,
        kind,
        size: node.size ?? (kind === "person" ? 9 : kind === "seat" ? 8 : 10),
        color:
          node.color ||
          nodeColor(kind, "org_type" in node ? node.org_type : undefined),
        type: nodeType(kind),
        column: node.column,
        polarity: node.polarity,
        x: 0,
        y: 0,
      });
    }

    for (const edge of edges) {
      if (!graph.hasNode(edge.source) || !graph.hasNode(edge.target)) continue;
      const current = isCurrentTenure(edge.end_date);
      const seated = edge.kind === "seat_holder" || Boolean(edge.is_primary);
      const isAffinity = edge.shared != null || edge.jaccard != null;
      const isStance = Boolean(
        edge.stance_kind || edge.polarity || edge.kind === "stance"
      );
      const dashed =
        Boolean(edge.dashed) ||
        edge.kind === "opposed-on-issues" ||
        edge.polarity === "oppose" ||
        (!current && !isAffinity && !isStance);
      const affinityWeight = edge.shared ?? edge.jaccard ?? 1;
      const stanceWeight = Math.max(edge.co_stance ?? 0, edge.opposed ?? 0, 1);
      graph.addEdge(edge.source, edge.target, {
        kind: edge.kind ?? "membership",
        role: edge.role ?? null,
        is_primary: Boolean(edge.is_primary),
        start_date: edge.start_date ?? null,
        end_date: edge.end_date ?? null,
        shared: edge.shared,
        jaccard: edge.jaccard,
        shared_names: edge.shared_names,
        polarity: edge.polarity,
        stance_kind: edge.stance_kind,
        co_stance: edge.co_stance,
        opposed: edge.opposed,
        current,
        dashed,
        size:
          seated || (edge.shared ?? 0) > 1 || stanceWeight > 1
            ? 2.4 * Math.min(isStance ? stanceWeight : affinityWeight, 3)
            : 1.4,
        color:
          edge.color ||
          (current || isAffinity || isStance ? CURRENT_EDGE_COLOR : PAST_EDGE_COLOR),
        hidden: dashed,
        forceLabel: false,
      });
    }

    layoutGraph(graph, centerId, layout);

    const hideTooltip = () => {
      if (!tooltip) return;
      tooltip.classList.add("hidden");
      tooltip.replaceChildren();
    };

    const showTooltip = (edgeKey: string, clientX: number, clientY: number) => {
      if (!tooltip) return;
      const attrs = graph.getEdgeAttributes(edgeKey);
      const source = graph.source(edgeKey);
      const target = graph.target(edgeKey);
      const lines = tooltipLines(edgeFromAttrs(source, target, attrs));
      if (lines.length === 0) {
        hideTooltip();
        return;
      }
      const rect = container.getBoundingClientRect();
      tooltip.replaceChildren();
      for (const line of lines) {
        const row = document.createElement("div");
        row.textContent = line;
        tooltip.appendChild(row);
      }
      tooltip.style.left = `${clientX - rect.left + 12}px`;
      tooltip.style.top = `${clientY - rect.top + 12}px`;
      tooltip.classList.remove("hidden");
    };

    const renderer = new Sigma(graph, container, {
      allowInvalidContainer: true,
      renderEdgeLabels: false,
      enableEdgeEvents: true,
      labelFont: "var(--font-dm-sans), DM Sans, sans-serif",
      labelSize: 11,
      labelWeight: "600",
      labelColor: { color: "#243324" },
      defaultNodeType: "circle",
      defaultEdgeColor: CURRENT_EDGE_COLOR,
      minCameraRatio: 0.15,
      maxCameraRatio: 4,
      nodeProgramClasses: {
        square: NodeSquareProgram,
        diamond: NodeDiamondProgram,
      },
    });

    const drawDashed = () => {
      if (!overlay) return;
      const ctx = overlay.getContext("2d");
      if (!ctx) return;
      const { width, height } = renderer.getDimensions();
      const dpr = window.devicePixelRatio || 1;
      overlay.width = width * dpr;
      overlay.height = height * dpr;
      overlay.style.width = `${width}px`;
      overlay.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      graph.forEachEdge((_edge, attrs, _source, _target, sourceAttr, targetAttr) => {
        if (!attrs.dashed) return;
        const from = renderer.graphToViewport({
          x: sourceAttr.x as number,
          y: sourceAttr.y as number,
        });
        const to = renderer.graphToViewport({
          x: targetAttr.x as number,
          y: targetAttr.y as number,
        });
        ctx.strokeStyle = String(attrs.color || PAST_EDGE_COLOR);
        ctx.lineWidth = Number(attrs.size || 1);
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
      });
    };

    renderer.on("afterRender", drawDashed);
    renderer.on("clickNode", ({ node }) => {
      const kind = graph.getNodeAttribute(node, "kind") as RenderableNode["kind"];
      clickRef.current?.(node, kind);
    });
    renderer.on("clickEdge", ({ edge }) => {
      const attrs = graph.getEdgeAttributes(edge);
      edgeClickRef.current?.(
        edgeFromAttrs(graph.source(edge), graph.target(edge), attrs)
      );
    });
    renderer.on("enterEdge", ({ edge }) => {
      const original = Number(graph.getEdgeAttribute(edge, "size") || 1.4);
      graph.setEdgeAttribute(edge, "hoverSize", original);
      graph.setEdgeAttribute(edge, "size", Math.max(original * 1.6, 2.4));
      showTooltip(edge, lastMouseRef.current.x, lastMouseRef.current.y);
    });
    renderer.on("leaveEdge", ({ edge }) => {
      const hoverSize = graph.getEdgeAttribute(edge, "hoverSize");
      if (typeof hoverSize === "number") {
        graph.setEdgeAttribute(edge, "size", hoverSize);
      }
      hideTooltip();
    });
    renderer.on("clickStage", hideTooltip);

    const onMove = (ev: MouseEvent) => {
      lastMouseRef.current = { x: ev.clientX, y: ev.clientY };
      if (!tooltip || tooltip.classList.contains("hidden")) return;
      const rect = container.getBoundingClientRect();
      tooltip.style.left = `${ev.clientX - rect.left + 12}px`;
      tooltip.style.top = `${ev.clientY - rect.top + 12}px`;
    };
    container.addEventListener("mousemove", onMove);

    drawDashed();

    return () => {
      container.removeEventListener("mousemove", onMove);
      hideTooltip();
      renderer.kill();
      graph.clear();
    };
  }, [nodes, edges, centerId, layout]);

  if (nodes.length === 0) {
    return (
      <div
        className={`${heightClassName} rounded-lg border border-dashed border-cream-300 bg-cream-50 flex items-center justify-center text-sm font-body text-forest-500`}
      >
        No graph to display yet.
      </div>
    );
  }

  return (
    <div className={`relative ${heightClassName} rounded-lg border border-cream-200 bg-cream-50 overflow-hidden`}>
      <div ref={containerRef} className="absolute inset-0 cursor-pointer" />
      <canvas ref={overlayRef} className="absolute inset-0 pointer-events-none" />
      <div
        ref={tooltipRef}
        className="absolute z-10 hidden pointer-events-none max-w-[240px] rounded-md bg-forest-900 text-cream-50 text-[11px] font-body leading-snug px-2 py-1.5 shadow-lg"
      />
    </div>
  );
}
