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
  mixedActorGraph,
  nodeColor,
  nodeType,
  PAST_EDGE_COLOR,
  PRIMARY_EDGE_COLOR,
} from "@/lib/civic-graph";
import {
  degreesFromEdges,
  dropCollidingLabels,
  FOCUS_LABEL_ALL_ACTORS_MAX,
  drawWhoHoverRing,
  offsetCollidingLabels,
  topFocusLabelIds,
  truncateGraphLabel,
  visibleFocusLabelIds,
  visibleWhoLabelIds,
  type GraphLabelMode,
} from "@/lib/graph-labels";
import { whyLinkedTooltipLines, type WhyLinkedEntity } from "@/lib/why-linked";
import {
  EDGE_PICK_RADIUS_PX,
  pickClosestEdge,
  pickClosestNode,
  pickPreferredTarget,
  type ViewportEdge,
  type ViewportNode,
} from "@/lib/graph-edge-pick";
import {
  activeEmphasizedEdgeKey,
  emphasizeEdgeSize,
  emphasizedEdgeStroke,
  shortenEmphasizedStroke,
  whoNodeShape,
} from "@/lib/graph-edge-emphasis";
import { NodeDiamondProgram } from "./NodeDiamondProgram";
import type { OrgType, SeatType } from "@/lib/types";
import {
  buildClusterCauses,
  clusterCentroid,
  clusterLabelText,
  clusterRadius,
  clusterWashColor,
  nudgePointOffNodes,
  CLUSTER_LABEL_INK,
  CLUSTER_LABEL_SIZE_PX,
  CLUSTER_MIXED_STROKE,
  CLUSTER_WASH_OPACITY,
  type ClusterCause,
} from "@/lib/cluster-cause";
import { edgeHiddenByOrgFilter } from "@/lib/people-org-edge-filter";

/** Who graphs: ring only. Sigma's default hover chip would redraw the name. */
class WhoSquareProgram extends NodeSquareProgram {
  drawHover = (
    context: CanvasRenderingContext2D,
    data: { x: number; y: number; size: number }
  ) => {
    drawWhoHoverRing(context, data, "square");
  };
}

class WhoDiamondProgram extends NodeDiamondProgram {
  drawHover = (
    context: CanvasRenderingContext2D,
    data: { x: number; y: number; size: number }
  ) => {
    drawWhoHoverRing(context, data, "diamond");
  };
}

export interface RenderableNode {
  id: string;
  kind: "person" | "organization" | "seat";
  label: string;
  org_type?: OrgType;
  seat_type?: SeatType;
  size?: number;
  color?: string;
  member_count?: number;
  footprint?: number;
  type?: "circle" | "square" | "diamond";
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
  layout?: "force" | "ribbon" | "ego";
  labelMode?: GraphLabelMode;
  /** Who people/orgs: name every drawn object. A clicked line keeps the pair only. */
  nameEveryNode?: boolean;
  selectedEdge?: Pick<RenderableEdge, "source" | "target"> | null;
  heightClassName?: string;
  /** People overview only — org/mixed cause in the open middle of a group. */
  showClusterCause?: boolean;
  /** People Wider/All only. Hide lines that do not share this org. Same graph. */
  visibleSharedOrgId?: string | null;
  onClusterCauseClick?: (cause: ClusterCause) => void;
  onNodeClick?: (id: string, kind: RenderableNode["kind"]) => void;
  onEdgeClick?: (edge: RenderableEdge) => void;
  onStageClick?: () => void;
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

/**
 * Deterministic "petal" ego layout. The center person sits at the origin; each
 * board (organization) they sit on is a spoke, and that board's other members
 * (alters) are fanned right next to it. Peers cluster under the board that
 * connects them instead of all landing on one outer ring, so the shared-board
 * relationship reads without any person-to-person lines crossing the center.
 */
function layoutEgo(graph: Graph, centerId: string) {
  const R_SEAT = 66;
  const R_ORG = 138;
  const R_PERSON = 224;

  graph.setNodeAttribute(centerId, "x", 0);
  graph.setNodeAttribute(centerId, "y", 0);

  const orgIds: string[] = [];
  const seatIds: string[] = [];
  const alterIds: string[] = [];
  graph.forEachNode((id, attrs) => {
    if (id === centerId) return;
    const kind = (attrs.kind as string) || "person";
    if (kind === "organization") orgIds.push(id);
    else if (kind === "seat") seatIds.push(id);
    else alterIds.push(id);
  });
  orgIds.sort();
  seatIds.sort();

  const orgAngle = new Map<string, number>();
  const orgCount = Math.max(orgIds.length, 1);
  orgIds.forEach((id, i) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / orgCount;
    orgAngle.set(id, angle);
    graph.setNodeAttribute(id, "x", Math.cos(angle) * R_ORG);
    graph.setNodeAttribute(id, "y", Math.sin(angle) * R_ORG);
  });

  // Seats sit on an inner ring, offset half a step so they don't overlap spokes.
  const seatCount = Math.max(seatIds.length, 1);
  seatIds.forEach((id, i) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * (i + 0.5)) / seatCount;
    graph.setNodeAttribute(id, "x", Math.cos(angle) * R_SEAT);
    graph.setNodeAttribute(id, "y", Math.sin(angle) * R_SEAT);
  });

  // Group each alter under one of the center's boards it shares (an org neighbor).
  const altersByOrg = new Map<string, string[]>();
  const orphans: string[] = [];
  for (const alter of alterIds) {
    let primary: string | null = null;
    graph.forEachNeighbor(alter, (nb) => {
      if (!primary && orgAngle.has(nb)) primary = nb;
    });
    if (primary) {
      const list = altersByOrg.get(primary) ?? [];
      list.push(alter);
      altersByOrg.set(primary, list);
    } else {
      orphans.push(alter);
    }
  }

  const slice = (2 * Math.PI) / orgCount;
  altersByOrg.forEach((list, org) => {
    const base = orgAngle.get(org) ?? 0;
    const k = list.length;
    const fan = Math.min(slice * 0.82, 0.24 * k);
    list.sort();
    list.forEach((alter, i) => {
      const t = k === 1 ? 0 : i / (k - 1) - 0.5; // -0.5..0.5 across the fan
      const angle = base + t * fan;
      // Stagger radius so a wide fan's nodes and labels don't collide.
      const r = R_PERSON + (i % 2 === 0 ? 0 : 26);
      graph.setNodeAttribute(alter, "x", Math.cos(angle) * r);
      graph.setNodeAttribute(alter, "y", Math.sin(angle) * r);
    });
  });

  orphans.forEach((alter, i) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / Math.max(orphans.length, 1);
    graph.setNodeAttribute(alter, "x", Math.cos(angle) * (R_PERSON + 34));
    graph.setNodeAttribute(alter, "y", Math.sin(angle) * (R_PERSON + 34));
  });
}

function layoutGraph(
  graph: Graph,
  centerId?: string | null,
  layout: "force" | "ribbon" | "ego" = "force"
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

  if (layout === "ego" && centerId && graph.hasNode(centerId)) {
    layoutEgo(graph, centerId);
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
  graph.forEachNode((key, attrs) => {
    const data = renderer.getNodeDisplayData(key);
    if (!data) return;
    const pos = renderer.graphToViewport({
      x: Number(attrs.x) || 0,
      y: Number(attrs.y) || 0,
    });
    nodes.push({
      key,
      x: pos.x,
      y: pos.y,
      size: renderer.scaleSize(data.size),
    });
  });
  return nodes;
}

function viewportEdges(renderer: Sigma, graph: Graph): ViewportEdge[] {
  const edges: ViewportEdge[] = [];
  graph.forEachEdge((key, attrs, source, target) => {
    if (attrs.orgFilteredOut) return;
    if (!graph.hasNode(source) || !graph.hasNode(target)) return;
    const from = renderer.graphToViewport({
      x: Number(graph.getNodeAttribute(source, "x")) || 0,
      y: Number(graph.getNodeAttribute(source, "y")) || 0,
    });
    const to = renderer.graphToViewport({
      x: Number(graph.getNodeAttribute(target, "x")) || 0,
      y: Number(graph.getNodeAttribute(target, "y")) || 0,
    });
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
  nameEveryNode = false,
  selectedEdge = null,
  heightClassName = "h-[320px] sm:h-[380px]",
  showClusterCause = false,
  visibleSharedOrgId = null,
  onClusterCauseClick,
  onNodeClick,
  onEdgeClick,
  onStageClick,
}: CivicGraphProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const clusterLabelsRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const lastMouseRef = useRef({ x: 0, y: 0 });
  const clickRef = useRef(onNodeClick);
  clickRef.current = onNodeClick;
  const edgeClickRef = useRef(onEdgeClick);
  edgeClickRef.current = onEdgeClick;
  const stageClickRef = useRef(onStageClick);
  stageClickRef.current = onStageClick;
  const labelModeRef = useRef(labelMode);
  labelModeRef.current = labelMode;
  const nameEveryNodeRef = useRef(nameEveryNode);
  nameEveryNodeRef.current = nameEveryNode;
  const selectedEdgeRef = useRef(selectedEdge);
  selectedEdgeRef.current = selectedEdge;
  const showClusterCauseRef = useRef(showClusterCause);
  showClusterCauseRef.current = showClusterCause;
  const visibleSharedOrgIdRef = useRef(visibleSharedOrgId);
  visibleSharedOrgIdRef.current = visibleSharedOrgId;
  const clusterClickRef = useRef(onClusterCauseClick);
  clusterClickRef.current = onClusterCauseClick;
  const applyLabelsRef = useRef<() => void>(() => {});
  const drawOverlayRef = useRef<() => void>(() => {});
  const applyOrgEdgeFilterRef = useRef<() => void>(() => {});
  const rendererRef = useRef<Sigma | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    const overlay = overlayRef.current;
    const tooltip = tooltipRef.current;
    if (!container) return;

    const graph = new Graph({ multi: true, type: "undirected" });
    const mixedActors = mixedActorGraph(nodes);
    for (const node of nodes) {
      if (graph.hasNode(node.id)) continue;
      const kind = node.kind;
      const isCenter = Boolean(centerId && node.id === centerId);
      graph.addNode(node.id, {
        label: truncateGraphLabel(node.label),
        kind,
        size:
          node.size ??
          (isCenter
            ? clampEgoSize(undefined)
            : kind === "person"
              ? 9
              : kind === "seat"
                ? 8
                : 10),
        color:
          node.color ||
          nodeColor(kind, "org_type" in node ? node.org_type : undefined),
        type: node.type ?? nodeType(kind),
        column: node.column,
        polarity: node.polarity,
        member_count: node.member_count,
        footprint: node.footprint,
        fullLabel: node.label,
        forceLabel: false,
        x: 0,
        y: 0,
      });
    }

    for (const edge of edges) {
      if (!graph.hasNode(edge.source) || !graph.hasNode(edge.target)) continue;
      // In mixed ego views, shared-board ties are shown structurally (peers
      // cluster under the board they share). People-only overviews draw them.
      if (edge.kind === "shared_board" && mixedActors) continue;
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
        orgFilteredOut: false,
        forceLabel: false,
      });
    }

    const applyOrgEdgeFilter = () => {
      const orgId = visibleSharedOrgIdRef.current ?? null;
      graph.forEachEdge((key, attrs) => {
        const filteredOut = edgeHiddenByOrgFilter(
          {
            shared_entities: attrs.shared_entities,
            shared_names: attrs.shared_names,
          },
          orgId
        );
        graph.setEdgeAttribute(key, "orgFilteredOut", filteredOut);
        graph.setEdgeAttribute(key, "hidden", Boolean(attrs.dashed) || filteredOut);
      });
    };
    applyOrgEdgeFilter();
    applyOrgEdgeFilterRef.current = applyOrgEdgeFilter;

    layoutGraph(graph, centerId, layout);

    const clusterCauses = showClusterCause
      ? buildClusterCauses(graph.nodes(), edges)
      : [];
    const labelsRoot = clusterLabelsRef.current;
    if (labelsRoot) {
      labelsRoot.replaceChildren();
      for (const cause of clusterCauses) {
        const wrap = document.createElement("div");
        wrap.dataset.clusterId = cause.id;
        wrap.className =
          "absolute pointer-events-auto -translate-x-1/2 -translate-y-1/2 z-[5]";
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = clusterLabelText(cause);
        btn.style.fontSize = `${CLUSTER_LABEL_SIZE_PX}px`;
        btn.style.fontWeight = "600";
        btn.style.color = CLUSTER_LABEL_INK;
        // Cream pill stays so the cause does not sit on a thickened stroke.
        btn.style.background = "#F5F5F0";
        btn.style.border = "1px solid #E3E0D7";
        btn.style.borderRadius = "999px";
        btn.style.padding = "2px 8px";
        btn.style.lineHeight = "1.2";
        btn.style.fontFamily = "var(--font-dm-sans), DM Sans, sans-serif";
        btn.style.whiteSpace = "nowrap";
        btn.style.cursor = "pointer";
        btn.style.userSelect = "none";
        btn.setAttribute(
          "aria-label",
          cause.kind === "org"
            ? `Select ${cause.label}`
            : "Mixed boards, list shared organizations"
        );
        btn.addEventListener("click", (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          clusterClickRef.current?.(cause);
        });
        wrap.appendChild(btn);
        labelsRoot.appendChild(wrap);
      }
    }

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
        footprint: graph.getNodeAttribute(id, "footprint") as
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

    const placeTooltip = (lines: string[], clientX: number, clientY: number) => {
      if (!tooltip) return;
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

    const showEdgeTooltip = (edgeKey: string, clientX: number, clientY: number) => {
      const attrs = graph.getEdgeAttributes(edgeKey);
      const source = graph.source(edgeKey);
      const target = graph.target(edgeKey);
      placeTooltip(
        whyLinkedTooltipLines(edgeFromAttrs(source, target, attrs)).slice(0, 2),
        clientX,
        clientY
      );
    };

    const showNodeTooltip = (nodeKey: string, clientX: number, clientY: number) => {
      const attrs = graph.getNodeAttributes(nodeKey);
      const full =
        typeof attrs.fullLabel === "string" ? attrs.fullLabel : String(attrs.label ?? "");
      const lines: string[] = [];
      if (full) lines.push(full);
      if (attrs.kind === "person" && typeof attrs.footprint === "number") {
        lines.push(`Board footprint ${attrs.footprint}`);
      } else if (typeof attrs.member_count === "number") {
        lines.push(`${attrs.member_count} current members`);
      } else if (typeof attrs.footprint === "number") {
        lines.push(`Board footprint ${attrs.footprint}`);
      }
      placeTooltip(lines, clientX, clientY);
    };

    const renderer = new Sigma(graph, container, {
      allowInvalidContainer: true,
      renderLabels: !nameEveryNode,
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
      ...(nameEveryNode
        ? {
            defaultDrawNodeHover: (
              context: CanvasRenderingContext2D,
              data: { x: number; y: number; size: number }
            ) => drawWhoHoverRing(context, data, "circle"),
          }
        : {}),
      nodeProgramClasses: {
        square: nameEveryNode ? WhoSquareProgram : NodeSquareProgram,
        diamond: nameEveryNode ? WhoDiamondProgram : NodeDiamondProgram,
      },
    });
    rendererRef.current = renderer;

    let hoveredEdge: string | null = null;
    let hoveredNode: string | null = null;

    const labelBoxesFor = (ids: Iterable<string>) => {
      const boxes = [];
      for (const id of Array.from(ids)) {
        const display = renderer.getNodeDisplayData(id);
        if (!display) continue;
        const full = String(
          graph.getNodeAttribute(id, "fullLabel") ??
            graph.getNodeAttribute(id, "label") ??
            ""
        );
        const text = truncateGraphLabel(full);
        const width = Math.max(text.length, 1) * 6.8;
        const height = 13;
        boxes.push({
          id,
          x: display.x + display.size + 3,
          y: display.y - height / 2,
          w: width,
          h: height,
          rank: Number(
            graph.getNodeAttribute(id, "footprint") ??
              graph.getNodeAttribute(id, "member_count") ??
              0
          ),
        });
      }
      return boxes;
    };

    const applyLabels = () => {
      const hoveredEndpoints =
        hoveredEdge && graph.hasEdge(hoveredEdge)
          ? [graph.source(hoveredEdge), graph.target(hoveredEdge)]
          : null;
      const selected = selectedEdgeRef.current;
      const selectedEnds = selected
        ? [selected.source, selected.target]
        : null;
      if (nameEveryNodeRef.current) {
        // Pair labels follow selected-edge only. Hover does not paint a second name.
        const visible = visibleWhoLabelIds({
          nodeIds: graph.nodes(),
          selectedEdgeEndpoints: selectedEnds,
        });
        graph.forEachNode((id) => {
          graph.setNodeAttribute(id, "forceLabel", visible.has(id));
        });
        return;
      }
      const visible = visibleFocusLabelIds({
        mode: labelModeRef.current,
        nodeIds: graph.nodes(),
        centerId,
        hoveredNodeId: hoveredNode,
        hoveredEdgeEndpoints: hoveredEndpoints,
        selectedEdgeEndpoints: selectedEnds,
        topFocusIds,
        actorIds,
        labelAllActorsMax: ribbonCast ? FOCUS_LABEL_ALL_ACTORS_MAX : undefined,
      });
      const pinned = new Set<string>();
      if (hoveredNode) pinned.add(hoveredNode);
      for (const id of hoveredEndpoints ?? []) pinned.add(id);
      if (selected) {
        pinned.add(selected.source);
        pinned.add(selected.target);
      }
      const boxes = labelBoxesFor(visible);
      const shown =
        boxes.length > 0 ? dropCollidingLabels(boxes, pinned) : visible;
      graph.forEachNode((id) => {
        graph.setNodeAttribute(id, "forceLabel", shown.has(id));
      });
    };
    applyLabelsRef.current = applyLabels;
    applyLabels();

    const keyedEdges = () => {
      const rows: { key: string; source: string; target: string }[] = [];
      graph.forEachEdge((key, attrs, source, target) => {
        if (attrs.orgFilteredOut) return;
        rows.push({ key, source, target });
      });
      return rows;
    };

    const emphasizedEdgeKey = () => {
      if (!nameEveryNodeRef.current) return null;
      return activeEmphasizedEdgeKey({
        hoveredKey:
          hoveredEdge && graph.hasEdge(hoveredEdge) ? hoveredEdge : null,
        selectedPair: selectedEdgeRef.current,
        edges: keyedEdges(),
      });
    };

    const strokeViewportEdge = (
      ctx: CanvasRenderingContext2D,
      from: { x: number; y: number },
      to: { x: number; y: number },
      options: { color: string; size: number; dashed: boolean }
    ) => {
      ctx.strokeStyle = options.color;
      ctx.lineWidth = options.size;
      ctx.lineCap = "butt";
      ctx.setLineDash(options.dashed ? [6, 4] : []);
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
    };

    const nodeCap = (id: string) => {
      const display = renderer.getNodeDisplayData(id);
      const raw = Number(display?.size ?? graph.getNodeAttribute(id, "size") ?? 8);
      return {
        size: renderer.scaleSize(raw),
        shape: whoNodeShape(String(graph.getNodeAttribute(id, "type") || "circle")),
      };
    };

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
      const inkKey = emphasizedEdgeKey();
      // cluster-wash is ground (~12%). Ink is next. Cream pills sit on the stroke.
      if (showClusterCauseRef.current && clusterCauses.length > 0) {
        const nodeView = viewportNodes(renderer, graph);
        for (const cause of clusterCauses) {
          const graphPoints = [];
          for (const id of cause.memberIds) {
            if (!graph.hasNode(id)) continue;
            graphPoints.push({
              x: Number(graph.getNodeAttribute(id, "x")) || 0,
              y: Number(graph.getNodeAttribute(id, "y")) || 0,
            });
          }
          const viewPoints = graphPoints.map((point) =>
            renderer.graphToViewport(point)
          );
          const center = clusterCentroid(viewPoints);
          if (!center) continue;
          const radius = clusterRadius(viewPoints, 36);
          if (cause.kind === "org") {
            ctx.save();
            ctx.globalAlpha = CLUSTER_WASH_OPACITY;
            ctx.fillStyle = clusterWashColor(cause.orgId);
            ctx.beginPath();
            ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          } else if (!cause.folded) {
            // Mixed boards has no wash. Outline only on one sitting blob.
            ctx.save();
            ctx.globalAlpha = 0.45;
            ctx.strokeStyle = CLUSTER_MIXED_STROKE;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
          }
        }
        ctx.save();
        ctx.globalCompositeOperation = "destination-out";
        graph.forEachEdge((edgeId, attrs, _source, _target, sourceAttr, targetAttr) => {
          if (attrs.orgFilteredOut) return;
          const from = renderer.graphToViewport({
            x: Number(sourceAttr.x) || 0,
            y: Number(sourceAttr.y) || 0,
          });
          const to = renderer.graphToViewport({
            x: Number(targetAttr.x) || 0,
            y: Number(targetAttr.y) || 0,
          });
          const display = renderer.getEdgeDisplayData(edgeId);
          const size = Number(display?.size ?? attrs.size ?? 1.4) + 1.5;
          ctx.lineWidth = size;
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(from.x, from.y);
          ctx.lineTo(to.x, to.y);
          ctx.stroke();
        });
        graph.forEachNode((id, attrs) => {
          const display = renderer.getNodeDisplayData(id);
          if (!display) return;
          const pos = renderer.graphToViewport({
            x: Number(attrs.x) || 0,
            y: Number(attrs.y) || 0,
          });
          const radius = Number(display.size ?? attrs.size ?? 8) + 1;
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
          ctx.fill();
        });
        ctx.restore();
        if (labelsRoot) {
          for (const wrap of Array.from(labelsRoot.children)) {
            if (!(wrap instanceof HTMLElement)) continue;
            const cause = clusterCauses.find(
              (row) => row.id === wrap.dataset.clusterId
            );
            if (!cause) {
              wrap.style.display = "none";
              continue;
            }
            const viewPoints = [];
            for (const id of cause.memberIds) {
              if (!graph.hasNode(id)) continue;
              viewPoints.push(
                renderer.graphToViewport({
                  x: Number(graph.getNodeAttribute(id, "x")) || 0,
                  y: Number(graph.getNodeAttribute(id, "y")) || 0,
                })
              );
            }
            const center = clusterCentroid(viewPoints) ?? viewPoints[0];
            if (!center) {
              wrap.style.display = "none";
              continue;
            }
            const view = nudgePointOffNodes(center, nodeView, 16);
            const x = Math.min(width - 24, Math.max(24, view.x));
            const y = Math.min(height - 16, Math.max(16, view.y));
            wrap.style.display = "block";
            wrap.style.left = `${x}px`;
            wrap.style.top = `${y}px`;
          }
        }
      }
      graph.forEachEdge((edge, attrs, _source, _target, sourceAttr, targetAttr) => {
        if (attrs.orgFilteredOut) return;
        if (!attrs.dashed || edge === inkKey) return;
        const from = renderer.graphToViewport({
          x: sourceAttr.x as number,
          y: sourceAttr.y as number,
        });
        const to = renderer.graphToViewport({
          x: targetAttr.x as number,
          y: targetAttr.y as number,
        });
        strokeViewportEdge(ctx, from, to, {
          color: String(attrs.color || PAST_EDGE_COLOR),
          size: Number(attrs.size || 1),
          dashed: true,
        });
      });
      if (inkKey && graph.hasEdge(inkKey) && !graph.getEdgeAttribute(inkKey, "orgFilteredOut")) {
        const attrs = graph.getEdgeAttributes(inkKey);
        const sourceId = graph.source(inkKey);
        const targetId = graph.target(inkKey);
        const from = renderer.graphToViewport({
          x: Number(graph.getNodeAttribute(sourceId, "x")) || 0,
          y: Number(graph.getNodeAttribute(sourceId, "y")) || 0,
        });
        const to = renderer.graphToViewport({
          x: Number(graph.getNodeAttribute(targetId, "x")) || 0,
          y: Number(graph.getNodeAttribute(targetId, "y")) || 0,
        });
        const shortened = shortenEmphasizedStroke(
          from,
          to,
          nodeCap(sourceId),
          nodeCap(targetId)
        );
        if (shortened) {
          strokeViewportEdge(ctx, shortened.from, shortened.to, {
            color: emphasizedEdgeStroke(),
            size: emphasizeEdgeSize(Number(attrs.size || 1.4)),
            dashed: Boolean(attrs.dashed),
          });
        }
      }
      if (centerId) drawEgoHalo(ctx, renderer, graph, centerId);
      if (nameEveryNodeRef.current) {
        const selected = selectedEdgeRef.current;
        const visible = visibleWhoLabelIds({
          nodeIds: graph.nodes(),
          selectedEdgeEndpoints: selected
            ? [selected.source, selected.target]
            : null,
        });
        const boxes = [];
        for (const id of Array.from(visible)) {
          if (!graph.hasNode(id)) continue;
          const attrs = graph.getNodeAttributes(id);
          const display = renderer.getNodeDisplayData(id);
          if (!display) continue;
          const pos = renderer.graphToViewport({
            x: Number(attrs.x) || 0,
            y: Number(attrs.y) || 0,
          });
          const text = truncateGraphLabel(
            String(attrs.fullLabel ?? attrs.label ?? "")
          );
          const radius = Number(display.size ?? attrs.size ?? 8);
          const height = 13;
          boxes.push({
            id,
            text,
            x: pos.x + radius + 4,
            y: pos.y - height / 2,
            w: Math.max(text.length, 1) * 6.8,
            h: height,
            rank: Number(attrs.footprint ?? attrs.member_count ?? 0),
          });
        }
        const offsets = offsetCollidingLabels(boxes);
        ctx.save();
        ctx.font = "600 11px var(--font-dm-sans), DM Sans, sans-serif";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#243324";
        for (const box of boxes) {
          const offset = offsets.get(box.id) ?? { dx: 0, dy: 0 };
          ctx.fillText(
            box.text,
            box.x + offset.dx,
            box.y + box.h / 2 + offset.dy
          );
        }
        ctx.restore();
      }
    };
    drawOverlayRef.current = drawOverlay;

    renderer.on("afterRender", drawOverlay);
    const emitEdgeClick = (edgeKey: string) => {
      const attrs = graph.getEdgeAttributes(edgeKey);
      edgeClickRef.current?.(
        edgeFromAttrs(graph.source(edgeKey), graph.target(edgeKey), attrs)
      );
    };

    const applyHover = (edgeKey: string | null, clientX: number, clientY: number) => {
      const changed = hoveredEdge !== edgeKey;
      if (
        changed &&
        !nameEveryNodeRef.current &&
        hoveredEdge &&
        graph.hasEdge(hoveredEdge)
      ) {
        const hoverSize = graph.getEdgeAttribute(hoveredEdge, "hoverSize");
        if (typeof hoverSize === "number") {
          graph.setEdgeAttribute(hoveredEdge, "size", hoverSize);
        }
      }
      if (changed) {
        hoveredEdge = edgeKey;
        applyLabels();
        if (!nameEveryNodeRef.current && edgeKey) {
          const original = Number(graph.getEdgeAttribute(edgeKey, "size") || 1.4);
          if (typeof graph.getEdgeAttribute(edgeKey, "hoverSize") !== "number") {
            graph.setEdgeAttribute(edgeKey, "hoverSize", original);
          }
          graph.setEdgeAttribute(edgeKey, "size", emphasizeEdgeSize(original));
        }
      }
      if (nameEveryNodeRef.current) drawOverlay();
      if (!edgeKey) {
        hideTooltip();
        return;
      }
      showEdgeTooltip(edgeKey, clientX, clientY);
    };

    renderer.on("clickNode", ({ node, event }) => {
      const preferred = pickPreferredTarget(
        viewportNodes(renderer, graph),
        viewportEdges(renderer, graph),
        event.x,
        event.y
      );
      if (preferred.edge) {
        emitEdgeClick(preferred.edge);
        return;
      }
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
      stageClickRef.current?.();
    });
    renderer.on("enterNode", ({ node }) => {
      hoveredNode = node;
      applyLabels();
    });
    renderer.on("leaveNode", () => {
      hoveredNode = null;
      applyLabels();
    });

    const hoverAtViewport = (
      x: number,
      y: number,
      clientX: number,
      clientY: number
    ) => {
      lastMouseRef.current = { x: clientX, y: clientY };
      const preferred = pickPreferredTarget(
        viewportNodes(renderer, graph),
        viewportEdges(renderer, graph),
        x,
        y
      );
      if (preferred.node !== hoveredNode) {
        hoveredNode = preferred.node;
        applyLabels();
      }
      if (preferred.node) {
        applyHover(null, clientX, clientY);
        showNodeTooltip(preferred.node, clientX, clientY);
        return;
      }
      applyHover(preferred.edge, clientX, clientY);
    };
    const onMove = (ev: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      hoverAtViewport(
        ev.clientX - rect.left,
        ev.clientY - rect.top,
        ev.clientX,
        ev.clientY
      );
    };
    const onLeave = () => {
      applyHover(null, 0, 0);
    };
    const onSigmaMove = ({ event }: { event: { x: number; y: number; original: MouseEvent | TouchEvent } }) => {
      const original = event.original;
      const clientX =
        "clientX" in original ? original.clientX : lastMouseRef.current.x;
      const clientY =
        "clientY" in original ? original.clientY : lastMouseRef.current.y;
      hoverAtViewport(event.x, event.y, clientX, clientY);
    };
    const stage = stageRef.current ?? container;
    // Capture plus Sigma moveBody (same coords as click) so hover paints before click.
    stage.addEventListener("pointermove", onMove, true);
    stage.addEventListener("pointerleave", onLeave);
    renderer.on("moveBody", onSigmaMove);

    let fitted = false;
    const tryFit = () => {
      if (container.clientWidth < 8 || container.clientHeight < 8) return;
      fitCameraWithPadding(renderer);
      fitted = true;
    };
    tryFit();
    applyLabels();

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
      stage.removeEventListener("pointermove", onMove, true);
      stage.removeEventListener("pointerleave", onLeave);
      renderer.removeListener("moveBody", onSigmaMove);
      hideTooltip();
      labelsRoot?.replaceChildren();
      rendererRef.current = null;
      applyOrgEdgeFilterRef.current = () => {};
      renderer.kill();
      graph.clear();
    };
  }, [nodes, edges, centerId, layout, nameEveryNode, showClusterCause]);

  useEffect(() => {
    applyOrgEdgeFilterRef.current();
    rendererRef.current?.refresh();
    drawOverlayRef.current();
  }, [visibleSharedOrgId]);

  useEffect(() => {
    applyLabelsRef.current();
    drawOverlayRef.current();
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
    <div
      ref={stageRef}
      className={`relative ${heightClassName} border border-line bg-canvas overflow-hidden`}
    >
      <div ref={containerRef} className="absolute inset-0 cursor-pointer" />
      <canvas ref={overlayRef} className="absolute inset-0 pointer-events-none" />
      <div
        ref={clusterLabelsRef}
        className="absolute inset-0 pointer-events-none overflow-hidden"
      />
      <div
        ref={tooltipRef}
        className="absolute z-10 hidden pointer-events-none max-w-[240px] bg-forest-900 text-cream-50 text-[11px] font-body leading-snug px-2 py-1.5 border border-line"
      />
    </div>
  );
}
