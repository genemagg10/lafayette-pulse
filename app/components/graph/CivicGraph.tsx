"use client";

import { useEffect, useRef } from "react";
import Graph from "graphology";
import forceAtlas2 from "graphology-layout-forceatlas2";
import circular from "graphology-layout/circular";
import Sigma from "sigma";
import { NodeSquareProgram } from "@sigma/node-square";
import {
  CURRENT_EDGE_COLOR,
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
}

interface CivicGraphProps {
  nodes: RenderableNode[];
  edges: RenderableEdge[];
  centerId?: string | null;
  heightClassName?: string;
  onNodeClick?: (id: string, kind: RenderableNode["kind"]) => void;
}

function layoutGraph(graph: Graph, centerId?: string | null) {
  if (graph.order === 0) return;
  if (graph.order === 1) {
    const id = graph.nodes()[0];
    graph.setNodeAttribute(id, "x", 0);
    graph.setNodeAttribute(id, "y", 0);
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
    const place = (ids: string[], radius: number) => {
      ids.forEach((id, index) => {
        const angle = (2 * Math.PI * index) / Math.max(ids.length, 1) - Math.PI / 2;
        graph.setNodeAttribute(id, "x", Math.cos(angle) * radius);
        graph.setNodeAttribute(id, "y", Math.sin(angle) * radius);
      });
    };
    place(rings.seat, 36);
    place(rings.organization, 70);
    place(rings.person, 108);
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

export default function CivicGraph({
  nodes,
  edges,
  centerId,
  heightClassName = "h-[320px] sm:h-[380px]",
  onNodeClick,
}: CivicGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const clickRef = useRef(onNodeClick);
  clickRef.current = onNodeClick;

  useEffect(() => {
    const container = containerRef.current;
    const overlay = overlayRef.current;
    if (!container) return;

    const graph = new Graph({ multi: true, type: "undirected" });
    for (const node of nodes) {
      if (graph.hasNode(node.id)) continue;
      const kind = node.kind;
      graph.addNode(node.id, {
        label: node.label,
        kind,
        size: node.size ?? (kind === "person" ? 9 : kind === "seat" ? 8 : 10),
        color: nodeColor(kind, "org_type" in node ? node.org_type : undefined),
        type: nodeType(kind),
        x: 0,
        y: 0,
      });
    }

    for (const edge of edges) {
      if (!graph.hasNode(edge.source) || !graph.hasNode(edge.target)) continue;
      const current = isCurrentTenure(edge.end_date);
      const seated = edge.kind === "seat_holder" || Boolean(edge.is_primary);
      const affinityWeight = edge.shared ?? edge.jaccard ?? 1;
      graph.addEdge(edge.source, edge.target, {
        kind: edge.kind ?? "membership",
        role: edge.role ?? null,
        current,
        size: seated || (edge.shared ?? 0) > 1 ? 2.4 * Math.min(affinityWeight, 3) : 1.1,
        color: current ? CURRENT_EDGE_COLOR : PAST_EDGE_COLOR,
        hidden: !current && !edge.shared && !edge.jaccard,
        forceLabel: false,
      });
    }

    layoutGraph(graph, centerId);

    const renderer = new Sigma(graph, container, {
      allowInvalidContainer: true,
      renderEdgeLabels: false,
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
        if (attrs.current) return;
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

    drawDashed();

    return () => {
      renderer.kill();
      graph.clear();
    };
  }, [nodes, edges, centerId]);

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
      <div ref={containerRef} className="absolute inset-0" />
      <canvas ref={overlayRef} className="absolute inset-0 pointer-events-none" />
    </div>
  );
}
