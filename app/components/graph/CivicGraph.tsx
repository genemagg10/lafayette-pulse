"use client";

import { useEffect, useRef } from "react";
import Graph from "graphology";
import forceAtlas2 from "graphology-layout-forceatlas2";
import circular from "graphology-layout/circular";
import Sigma from "sigma";
import { NodeSquareProgram } from "@sigma/node-square";
import {
  CURRENT_EDGE_COLOR,
  EGO_CENTER_SIZE,
  EGO_HALO_COLOR,
  EGO_HALO_WIDTH_PX,
  isCurrentTenure,
  nodeColor,
  nodeType,
  PAST_EDGE_COLOR,
  PRIMARY_EDGE_COLOR,
} from "@/lib/civic-graph";
import {
  degreesFromEdges,
  FOCUS_LABEL_ALL_ACTORS_MAX,
  topFocusLabelIds,
  visibleFocusLabelIds,
  type GraphLabelMode,
} from "@/lib/graph-labels";
import { whyLinkedTooltipLines, type WhyLinkedEntity } from "@/lib/why-linked";
import {
  EDGE_PICK_RADIUS_PX,
  pickClosestEdge,
  pickClosestNode,
  type ViewportEdge,
  type ViewportNode,
} from "@/lib/graph-edge-pick";
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
  member_count?: number;
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
  shared_entities?: WhyLinkedEntity[];
  shared_subjects?: string[];
  source_url?: string | null;
  organization_id?: string | null;
  org_name?: string | null;
  evidence_quote?: string | null;
  measure_title?: string | null;
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
  labelMode?: GraphLabelMode;
  selectedEdge?: Pick<RenderableEdge, "source" | "target"> | null;
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
    shared_entities: Array.isArray(attrs.shared_entities)
      ? (attrs.shared_entities as WhyLinkedEntity[])
      : undefined,
    shared_subjects: Array.isArray(attrs.shared_subjects)
      ? attrs.shared_subjects.filter((name): name is string => typeof name === "string")
      : undefined,
    source_url:
      typeof attrs.source_url === "string" || attrs.source_url === null
        ? (attrs.source_url as string | null)
        : undefined,
    organization_id:
      typeof attrs.organization_id === "string" || attrs.organization_id === null
        ? (attrs.organization_id as string | null)
        : undefined,
    org_name:
      typeof attrs.org_name === "string" || attrs.org_name === null
        ? (attrs.org_name as string | null)
        : undefined,
    evidence_quote:
      typeof attrs.evidence_quote === "string" || attrs.evidence_quote === null
        ? (attrs.evidence_quote as string | null)
        : undefined,
    measure_title:
      typeof attrs.measure_title === "string" || attrs.measure_title === null
        ? (attrs.measure_title as string | null)
        : undefined,
    color: typeof attrs.color === "string" ? attrs.color : undefined,
    dashed: Boolean(attrs.dashed),
    polarity: typeof attrs.polarity === "string" ? attrs.polarity : undefined,
    stance_kind: typeof attrs.stance_kind === "string" ? attrs.stance_kind : undefined,
    co_stance: typeof attrs.co_stance === "number" ? attrs.co_stance : undefined,
    opposed: typeof attrs.opposed === "number" ? attrs.opposed : undefined,
  };
}

function viewportNodes(renderer: Sigma, graph: Graph): ViewportNode[] {
  const nodes: ViewportNode[] = [];
  graph.forEachNode((key) => {
    const data = renderer.getNodeDisplayData(key);
    if (!data) return;
    nodes.push({ key, x: data.x, y: data.y, size: data.size });
  });
  return nodes;
}

function viewportEdges(renderer: Sigma, graph: Graph): ViewportEdge[] {
  const edges: ViewportEdge[] = [];
  graph.forEachEdge((key, _attrs, source, target) => {
    const from = renderer.getNodeDisplayData(source);
    const to = renderer.getNodeDisplayData(target);
    if (!from || !to) return;
    edges.push({ key, x1: from.x, y1: from.y, x2: to.x, y2: to.y });
  });
  return edges;
}

/** Fat hit-test in viewport pixels. Includes hidden/dashed overlay edges. */
function pickEdgeAt(
  renderer: Sigma,
  graph: Graph,
  x: number,
  y: number,
  options: { ignoreNodes?: boolean } = {}
): string | null {
  if (
    !options.ignoreNodes &&
    pickClosestNode(viewportNodes(renderer, graph), x, y)
  ) {
    return null;
  }
  return pickClosestEdge(
    viewportEdges(renderer, graph),
    x,
    y,
    EDGE_PICK_RADIUS_PX
  );
}

function clampEgoSize(size?: number): number {
  const value = size ?? EGO_CENTER_SIZE;
  return Math.min(18, Math.max(16, value));
}

function structuralEdgeColor(edge: RenderableEdge, current: boolean, seated: boolean): string {
  if (edge.color) return edge.color;
  if (seated) return PRIMARY_EDGE_COLOR;
  const isAffinity = edge.shared != null || edge.jaccard != null;
  const isStance = Boolean(
    edge.stance_kind || edge.polarity || edge.kind === "stance"
  );
  return current || isAffinity || isStance ? CURRENT_EDGE_COLOR : PAST_EDGE_COLOR;
}

function fitCameraWithPadding(renderer: Sigma) {
  const graph = renderer.getGraph();
  if (graph.order === 0) return;
  renderer.setCustomBBox(null);
  const bbox = renderer.getBBox();
  const dx = Math.max(bbox.x[1] - bbox.x[0], 1);
  const dy = Math.max(bbox.y[1] - bbox.y[0], 1);
  renderer.setCustomBBox({
    x: [bbox.x[0] - dx * 0.16, bbox.x[1] + dx * 0.16],
    y: [bbox.y[0] - dy * 0.2, bbox.y[1] + dy * 0.2],
  });
  renderer.getCamera().setState({ x: 0.5, y: 0.5, ratio: 1, angle: 0 });
}

function drawEgoHalo(
  ctx: CanvasRenderingContext2D,
  renderer: Sigma,
  graph: Graph,
  centerId: string
) {
  if (!graph.hasNode(centerId)) return;
  const attrs = graph.getNodeAttributes(centerId);
  const display = renderer.getNodeDisplayData(centerId);
  const pos = renderer.graphToViewport({
    x: Number(attrs.x) || 0,
    y: Number(attrs.y) || 0,
  });
  const radius = Number(display?.size ?? attrs.size ?? EGO_CENTER_SIZE);
  const type = String(attrs.type || "circle");
  ctx.save();
  ctx.strokeStyle = EGO_HALO_COLOR;
  ctx.lineWidth = EGO_HALO_WIDTH_PX;
  ctx.setLineDash([]);
  ctx.beginPath();
  if (type === "square") {
    ctx.rect(pos.x - radius, pos.y - radius, radius * 2, radius * 2);
  } else if (type === "diamond") {
    ctx.translate(pos.x, pos.y);
    ctx.rotate(Math.PI / 4);
    ctx.rect(-radius, -radius, radius * 2, radius * 2);
  } else {
    ctx.arc(pos.x, pos.y, radius + 1, 0, Math.PI * 2);
  }
  ctx.stroke();
  ctx.restore();
}

export default function CivicGraph({
  nodes,
  edges,
  centerId,
  layout = "force",
  labelMode = "focus",
  selectedEdge = null,
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
  const labelModeRef = useRef(labelMode);
  labelModeRef.current = labelMode;
  const selectedEdgeRef = useRef(selectedEdge);
  selectedEdgeRef.current = selectedEdge;
  const applyLabelsRef = useRef<() => void>(() => {});

  useEffect(() => {
    const container = containerRef.current;
    const overlay = overlayRef.current;
    const tooltip = tooltipRef.current;
    if (!container) return;

    const graph = new Graph({ multi: true, type: "undirected" });
    for (const node of nodes) {
      if (graph.hasNode(node.id)) continue;
      const kind = node.kind;
      const isCenter = Boolean(centerId && node.id === centerId);
      graph.addNode(node.id, {
        label: node.label,
        kind,
        size: isCenter
          ? clampEgoSize(node.size)
          : node.size ?? (kind === "person" ? 9 : kind === "seat" ? 8 : 10),
        color:
          node.color ||
          nodeColor(kind, "org_type" in node ? node.org_type : undefined),
        type: nodeType(kind),
        column: node.column,
        polarity: node.polarity,
        member_count: node.member_count,
        forceLabel: false,
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
        shared_entities: edge.shared_entities,
        shared_subjects: edge.shared_subjects,
        source_url: edge.source_url ?? null,
        organization_id: edge.organization_id ?? null,
        org_name: edge.org_name ?? null,
        evidence_quote: edge.evidence_quote ?? null,
        measure_title: edge.measure_title ?? null,
        polarity: edge.polarity,
        stance_kind: edge.stance_kind,
        co_stance: edge.co_stance,
        opposed: edge.opposed,
        current,
        dashed,
        // Visual stroke only — picking uses EDGE_PICK_RADIUS_PX, not this size.
        size:
          seated || (edge.shared ?? 0) > 1 || stanceWeight > 1
            ? 2.4 * Math.min(isStance ? stanceWeight : affinityWeight, 3)
            : 1.4,
        color: structuralEdgeColor(edge, current, seated),
        hidden: dashed,
        forceLabel: false,
      });
    }

    layoutGraph(graph, centerId, layout);

    const degreeById = degreesFromEdges(
      graph.nodes(),
      edges.map((edge) => ({ source: edge.source, target: edge.target }))
    );
    const topFocusIds = topFocusLabelIds(
      graph.nodes().map((id) => ({
        id,
        degree: degreeById.get(id) ?? graph.degree(id),
        member_count: graph.getNodeAttribute(id, "member_count") as
          | number
          | undefined,
      })),
      centerId
    );
    const actorIds = graph.nodes().filter((id) => {
      const kind = graph.getNodeAttribute(id, "kind");
      const column = graph.getNodeAttribute(id, "column");
      if (centerId && id === centerId) return false;
      if (column === "measure") return false;
      return kind === "person" || kind === "organization";
    });
    const ribbonCast = layout === "ribbon";

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
      const lines = whyLinkedTooltipLines(edgeFromAttrs(source, target, attrs)).slice(
        0,
        2
      );
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
      labelRenderedSizeThreshold: 10_000,
      labelDensity: 10,
      stagePadding: 64,
      minCameraRatio: 0.15,
      maxCameraRatio: 4,
      nodeProgramClasses: {
        square: NodeSquareProgram,
        diamond: NodeDiamondProgram,
      },
    });

    let hoveredEdge: string | null = null;
    let hoveredNode: string | null = null;

    const applyLabels = () => {
      const hoveredEndpoints =
        hoveredEdge && graph.hasEdge(hoveredEdge)
          ? [graph.source(hoveredEdge), graph.target(hoveredEdge)]
          : null;
      const selected = selectedEdgeRef.current;
      const visible = visibleFocusLabelIds({
        mode: labelModeRef.current,
        nodeIds: graph.nodes(),
        centerId,
        hoveredNodeId: hoveredNode,
        hoveredEdgeEndpoints: hoveredEndpoints,
        selectedEdgeEndpoints: selected
          ? [selected.source, selected.target]
          : null,
        topFocusIds,
        actorIds,
        labelAllActorsMax: ribbonCast ? FOCUS_LABEL_ALL_ACTORS_MAX : undefined,
      });
      graph.forEachNode((id) => {
        graph.setNodeAttribute(id, "forceLabel", visible.has(id));
      });
    };
    applyLabelsRef.current = applyLabels;
    applyLabels();

    const drawOverlay = () => {
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
      if (centerId) drawEgoHalo(ctx, renderer, graph, centerId);
    };

    renderer.on("afterRender", drawOverlay);
    const emitEdgeClick = (edgeKey: string) => {
      const attrs = graph.getEdgeAttributes(edgeKey);
      edgeClickRef.current?.(
        edgeFromAttrs(graph.source(edgeKey), graph.target(edgeKey), attrs)
      );
    };

    const applyHover = (edgeKey: string | null, clientX: number, clientY: number) => {
      if (hoveredEdge === edgeKey) {
        if (edgeKey) showTooltip(edgeKey, clientX, clientY);
        return;
      }
      if (hoveredEdge && graph.hasEdge(hoveredEdge)) {
        const hoverSize = graph.getEdgeAttribute(hoveredEdge, "hoverSize");
        if (typeof hoverSize === "number") {
          graph.setEdgeAttribute(hoveredEdge, "size", hoverSize);
        }
      }
      hoveredEdge = edgeKey;
      applyLabels();
      if (!edgeKey) {
        hideTooltip();
        return;
      }
      const original = Number(graph.getEdgeAttribute(edgeKey, "size") || 1.4);
      if (typeof graph.getEdgeAttribute(edgeKey, "hoverSize") !== "number") {
        graph.setEdgeAttribute(edgeKey, "hoverSize", original);
      }
      graph.setEdgeAttribute(edgeKey, "size", Math.max(original * 1.6, 2.4));
      showTooltip(edgeKey, clientX, clientY);
    };

    renderer.on("clickNode", ({ node }) => {
      const kind = graph.getNodeAttribute(node, "kind") as RenderableNode["kind"];
      clickRef.current?.(node, kind);
    });
    renderer.on("clickEdge", ({ edge }) => {
      emitEdgeClick(edge);
    });
    renderer.on("clickStage", ({ event }) => {
      const edge = pickEdgeAt(renderer, graph, event.x, event.y, {
        ignoreNodes: true,
      });
      if (edge) {
        emitEdgeClick(edge);
        return;
      }
      hideTooltip();
    });
    renderer.on("enterNode", ({ node }) => {
      hoveredNode = node;
      applyLabels();
    });
    renderer.on("leaveNode", () => {
      hoveredNode = null;
      applyLabels();
    });

    const onMove = (ev: PointerEvent) => {
      lastMouseRef.current = { x: ev.clientX, y: ev.clientY };
      const rect = container.getBoundingClientRect();
      const x = ev.clientX - rect.left;
      const y = ev.clientY - rect.top;
      const node = pickClosestNode(viewportNodes(renderer, graph), x, y);
      if (node !== hoveredNode) {
        hoveredNode = node;
        applyLabels();
      }
      const edge = pickEdgeAt(renderer, graph, x, y);
      applyHover(edge, ev.clientX, ev.clientY);
    };
    container.addEventListener("pointermove", onMove);
    container.addEventListener("pointerleave", hideTooltip);

    let fitted = false;
    const tryFit = () => {
      if (container.clientWidth < 8 || container.clientHeight < 8) return;
      fitCameraWithPadding(renderer);
      fitted = true;
    };
    tryFit();

    const resize = () => {
      renderer.resize();
      if (!fitted) tryFit();
      drawOverlay();
    };
    window.addEventListener("resize", resize);
    const observer =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
    observer?.observe(container);

    drawOverlay();

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", resize);
      container.removeEventListener("pointermove", onMove);
      container.removeEventListener("pointerleave", hideTooltip);
      hideTooltip();
      renderer.kill();
      graph.clear();
    };
  }, [nodes, edges, centerId, layout]);

  useEffect(() => {
    applyLabelsRef.current();
  }, [labelMode, selectedEdge]);

  if (nodes.length === 0) {
    return (
      <div
        className={`${heightClassName} rounded-lg border border-dashed border-line-strong bg-canvas flex items-center justify-center text-sm font-body text-ink-muted`}
      >
        No graph to display yet.
      </div>
    );
  }

  return (
    <div className={`relative ${heightClassName} border border-line bg-canvas overflow-hidden`}>
      <div ref={containerRef} className="absolute inset-0 cursor-pointer" />
      <canvas ref={overlayRef} className="absolute inset-0 pointer-events-none" />
      <div
        ref={tooltipRef}
        className="absolute z-10 hidden pointer-events-none max-w-[240px] bg-forest-900 text-cream-50 text-[11px] font-body leading-snug px-2 py-1.5 border border-line"
      />
    </div>
  );
}
