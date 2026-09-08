"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ORG_TYPE_COLORS } from "@/lib/civic-graph";
import { presentOrgTypesFromNodes, FOCUS_LABEL_ALL_ACTORS_MAX } from "@/lib/graph-labels";
import {
  BUBBLE_CAP_DESKTOP_PX,
  BUBBLE_CAP_MOBILE_PX,
  BUBBLE_FILL_OPACITY,
  BUBBLE_FLOOR_PX,
  BUBBLE_STROKE_PX,
  CANVAS_HEX,
  FOREST_HEX,
  MEDIAN_HAIRLINE,
  NOT_ON_RECORD_HEADER,
  SELECTED_RING_PX,
  STANCE_CORNERS,
  STRUCTURE_CORNERS,
  bubbleDiameter,
  compareSide,
  hoverLines,
  notOnRecordNodes,
  nudgePixelPoints,
  plottedNodes,
  scaleLinear,
  type OrgPlotNode,
  type OrgPlotResponse,
  type PixelPoint,
} from "@/lib/org-plot";
import { ORG_TYPE_LABELS } from "@/lib/types";

interface OrgPlotProps {
  data: OrgPlotResponse | null;
  loading?: boolean;
  error?: string | null;
  selectedId?: string | null;
  onSelect: (id: string) => void;
}

function usePlotBox() {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, box };
}

function useCompact() {
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)");
    const update = () => setCompact(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return compact;
}

function measureLabel(data: OrgPlotResponse): string | null {
  if (!data.measure) return null;
  return data.measure.short_code
    ? `${data.measure.short_code} · ${data.measure.title}`
    : data.measure.title;
}

export default function OrgPlot({
  data,
  loading,
  error,
  selectedId,
  onSelect,
}: OrgPlotProps) {
  const { ref, box } = usePlotBox();
  const compact = useCompact();
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const layout = useMemo(() => {
    if (!data || box.w < 40 || box.h < 40) return null;
    const view = data.view;
    const empty = Boolean(data.empty_copy);
    const dots = empty ? [] : plottedNodes(data.nodes, view);
    const cap = compact ? BUBBLE_CAP_MOBILE_PX : BUBBLE_CAP_DESKTOP_PX;
    const maxMembers = dots.reduce(
      (max, node) => Math.max(max, node.member_count),
      0
    );
    const pad = {
      top: compact ? 18 : 26,
      right: compact ? 12 : 18,
      bottom: compact ? 28 : 34,
      left: compact ? 28 : 36,
    };
    const plot = {
      minX: pad.left,
      maxX: box.w - pad.right,
      minY: pad.top,
      maxY: box.h - pad.bottom,
    };
    const maxR = cap / 2;
    const inner = {
      minX: plot.minX + maxR,
      maxX: plot.maxX - maxR,
      minY: plot.minY + maxR,
      maxY: plot.maxY - maxR,
    };

    if (dots.length === 0) {
      return {
        view,
        points: [] as (PixelPoint & { node: OrgPlotNode })[],
        midX: (inner.minX + inner.maxX) / 2,
        midY: (inner.minY + inner.maxY) / 2,
        plot,
        inner,
        empty,
      };
    }

    const reaches = dots.map((node) => node.reach);
    const footprints = dots.map((node) => node.footprint);
    const minReach = 0;
    const maxReach = Math.max(...reaches, data.median_x);
    const minFoot = 0;
    const maxFoot = Math.max(...footprints, data.median_y);
    const midX =
      view === "stance"
        ? (inner.minX + inner.maxX) / 2
        : scaleLinear(data.median_x, minReach, maxReach, inner.minX, inner.maxX);
    const midY = scaleLinear(data.median_y, minFoot, maxFoot, inner.maxY, inner.minY);

    const opposeX = inner.minX + (inner.maxX - inner.minX) * 0.22;
    const supportX = inner.minX + (inner.maxX - inner.minX) * 0.78;

    const raw: PixelPoint[] = dots.map((node) => {
      const d = bubbleDiameter(node.member_count, maxMembers, cap);
      const r = d / 2;
      if (view === "stance") {
        const x = node.stance === "oppose" ? opposeX : supportX;
        const y = scaleLinear(node.footprint, minFoot, maxFoot, inner.maxY, inner.minY);
        return {
          id: node.id,
          x,
          y,
          r,
          sideX: node.stance === "oppose" ? -1 : 1,
          sideY: compareSide(node.footprint, data.median_y),
        };
      }
      return {
        id: node.id,
        x: scaleLinear(node.reach, minReach, maxReach, inner.minX, inner.maxX),
        y: scaleLinear(node.footprint, minFoot, maxFoot, inner.maxY, inner.minY),
        r,
        sideX: compareSide(node.reach, data.median_x),
        sideY: compareSide(node.footprint, data.median_y),
      };
    });

    const nudged = nudgePixelPoints(raw, { ...inner, midX, midY });
    const byId = new Map(dots.map((node) => [node.id, node]));
    const points = nudged
      .map((point) => ({ ...point, node: byId.get(point.id)! }))
      .filter((point) => point.node);

    return { view, points, midX, midY, plot, inner, empty };
  }, [data, box.w, box.h, compact]);

  const hovered = useMemo(() => {
    if (!hoveredId || !layout) return null;
    return layout.points.find((point) => point.id === hoveredId) ?? null;
  }, [hoveredId, layout]);

  const listed = data ? notOnRecordNodes(data.nodes) : [];
  const showNotOnRecord =
    data?.view === "stance" && !data.empty_copy && listed.length > 0;
  const types = presentOrgTypesFromNodes(data?.nodes ?? []);

  if (error) {
    return <p className="text-sm font-body text-ink-muted">{error}</p>;
  }
  if ((loading && !data) || !data) {
    return <div className="flex-1 min-h-[320px] bg-canvas animate-pulse" />;
  }

  return (
    <div className="flex flex-col h-full min-h-0 gap-2">
      <div ref={ref} className="relative flex-1 min-h-[320px] bg-canvas">
        {data.empty_copy ? (
          <div className="absolute inset-0 flex items-center justify-center p-6">
            <div className="max-w-md text-center space-y-2">
              {data.view === "stance" && measureLabel(data) && (
                <p className="text-[11px] font-body text-ink-muted">
                  {measureLabel(data)}
                </p>
              )}
              <p className="text-sm font-body text-ink">{data.empty_copy}</p>
            </div>
          </div>
        ) : (
          <svg
            width={box.w}
            height={box.h}
            className="block w-full h-full"
            role="img"
            aria-label={
              data.view === "structure"
                ? "Organization structure plot: footprint by shared boards"
                : "Organization on-the-record plot: footprint by recorded stance"
            }
          >
            {layout && data.view === "structure" && (
              <>
                <line
                  x1={layout.midX}
                  x2={layout.midX}
                  y1={layout.plot.minY}
                  y2={layout.plot.maxY}
                  stroke={MEDIAN_HAIRLINE}
                  strokeWidth={1}
                />
                <line
                  x1={layout.plot.minX}
                  x2={layout.plot.maxX}
                  y1={layout.midY}
                  y2={layout.midY}
                  stroke={MEDIAN_HAIRLINE}
                  strokeWidth={1}
                />
              </>
            )}
            {layout && data.view === "stance" && (
              <line
                x1={layout.plot.minX}
                x2={layout.plot.maxX}
                y1={layout.midY}
                y2={layout.midY}
                stroke={MEDIAN_HAIRLINE}
                strokeWidth={1}
              />
            )}

            {layout && !compact && data.view === "structure" && (
              <g
                fill="currentColor"
                className="text-ink"
                opacity={0.6}
                fontSize={11}
                fontFamily="var(--font-dm-sans), DM Sans, sans-serif"
              >
                <text x={layout.plot.minX} y={layout.plot.minY + 11}>
                  {STRUCTURE_CORNERS.lowReachHighFootprint}
                </text>
                <text
                  x={layout.plot.maxX}
                  y={layout.plot.minY + 11}
                  textAnchor="end"
                >
                  {STRUCTURE_CORNERS.highReachHighFootprint}
                </text>
                <text x={layout.plot.minX} y={layout.plot.maxY - 4}>
                  {STRUCTURE_CORNERS.lowReachLowFootprint}
                </text>
                <text
                  x={layout.plot.maxX}
                  y={layout.plot.maxY - 4}
                  textAnchor="end"
                >
                  {STRUCTURE_CORNERS.highReachLowFootprint}
                </text>
              </g>
            )}

            {layout && !compact && data.view === "stance" && (
              <g
                fill="currentColor"
                className="text-ink"
                opacity={0.6}
                fontSize={11}
                fontFamily="var(--font-dm-sans), DM Sans, sans-serif"
              >
                <text x={layout.plot.minX} y={layout.plot.minY + 11}>
                  {STANCE_CORNERS.highOppose}
                </text>
                <text
                  x={layout.plot.maxX}
                  y={layout.plot.minY + 11}
                  textAnchor="end"
                >
                  {STANCE_CORNERS.highSupport}
                </text>
                <text
                  x={(layout.plot.minX + layout.plot.maxX) / 2}
                  y={layout.plot.maxY - 4}
                  textAnchor="middle"
                >
                  {STANCE_CORNERS.lowRecorded}
                </text>
              </g>
            )}

            {layout &&
              layout.points.map((point) => {
                const selected = point.id === selectedId;
                const color = ORG_TYPE_COLORS[point.node.org_type] || ORG_TYPE_COLORS.other;
                const showName =
                  selected ||
                  hoveredId === point.id ||
                  layout.points.length <= FOCUS_LABEL_ALL_ACTORS_MAX;
                const nameBelow = point.y + point.r + 14 < layout.plot.maxY;
                return (
                  <g
                    key={point.id}
                    role="button"
                    tabIndex={0}
                    aria-label={hoverLines(
                      point.node,
                      data.view,
                      data.median_y
                    ).join(". ")}
                    aria-pressed={selected}
                    style={{ cursor: "pointer" }}
                    onMouseEnter={() => setHoveredId(point.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    onFocus={() => setHoveredId(point.id)}
                    onBlur={() => setHoveredId(null)}
                    onClick={() => onSelect(point.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onSelect(point.id);
                      }
                    }}
                  >
                    {selected && (
                      <circle
                        cx={point.x}
                        cy={point.y}
                        r={point.r + 3}
                        fill="none"
                        stroke={FOREST_HEX}
                        strokeWidth={SELECTED_RING_PX}
                      />
                    )}
                    <circle
                      cx={point.x}
                      cy={point.y}
                      r={point.r}
                      fill={color}
                      fillOpacity={BUBBLE_FILL_OPACITY}
                      stroke={CANVAS_HEX}
                      strokeWidth={BUBBLE_STROKE_PX}
                    />
                    {point.node.stance === "endorse" && (
                      <text
                        x={point.x + point.r * 0.55}
                        y={point.y - point.r * 0.55}
                        fontSize={9}
                        fontFamily="var(--font-dm-sans), DM Sans, sans-serif"
                        fill={FOREST_HEX}
                        textAnchor="middle"
                      >
                        E
                      </text>
                    )}
                    {showName && (
                      <text
                        x={point.x}
                        y={nameBelow ? point.y + point.r + 12 : point.y - point.r - 6}
                        textAnchor="middle"
                        fontSize={compact ? 10 : 11}
                        fontFamily="var(--font-dm-sans), DM Sans, sans-serif"
                        fill={FOREST_HEX}
                      >
                        {point.node.stance === "endorse"
                          ? `${point.node.name} · Endorse`
                          : point.node.name}
                      </text>
                    )}
                  </g>
                );
              })}

            {layout && (
              <g
                fill="currentColor"
                className="text-ink-muted"
                fontSize={11}
                fontFamily="var(--font-dm-sans), DM Sans, sans-serif"
              >
                <text
                  transform={`translate(12 ${(layout.plot.minY + layout.plot.maxY) / 2}) rotate(-90)`}
                  textAnchor="middle"
                >
                  Footprint
                </text>
                {data.view === "structure" ? (
                  <text
                    x={(layout.plot.minX + layout.plot.maxX) / 2}
                    y={box.h - 8}
                    textAnchor="middle"
                  >
                    Shared boards
                  </text>
                ) : (
                  <>
                    <text x={layout.plot.minX} y={box.h - 8}>
                      ▼ Oppose
                    </text>
                    <text x={layout.plot.maxX} y={box.h - 8} textAnchor="end">
                      ▲ Support
                    </text>
                  </>
                )}
              </g>
            )}
          </svg>
        )}

        {hovered && data && !data.empty_copy && (
          <div
            className="absolute z-10 pointer-events-none bg-surface border border-line px-2 py-1.5 text-[11px] font-body text-ink max-w-[220px]"
            style={{
              left: Math.min(hovered.x + 12, box.w - 180),
              top: Math.max(8, hovered.y - hovered.r - 52),
            }}
          >
            {hoverLines(hovered.node, data.view, data.median_y).map((line) => (
              <p key={line} className={line === hovered.node.name ? "font-heading font-semibold" : "text-ink-muted"}>
                {line}
              </p>
            ))}
          </div>
        )}
      </div>

      <p className="text-[11px] font-body text-ink-muted">{data.caption}</p>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-body text-forest-600">
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block rounded-full border"
            style={{
              width: BUBBLE_FLOOR_PX / 2,
              height: BUBBLE_FLOOR_PX / 2,
              borderColor: CANVAS_HEX,
              background: FOREST_HEX,
              opacity: BUBBLE_FILL_OPACITY,
            }}
          />
          Size = members
        </span>
        {types.map((type) => (
          <span key={type} className="inline-flex items-center gap-1">
            <span
              className="inline-block w-2 h-2 rounded-full"
              style={{ background: ORG_TYPE_COLORS[type] }}
            />
            {ORG_TYPE_LABELS[type]}
          </span>
        ))}
      </div>

      {showNotOnRecord && (
        <details className="text-[12px] font-body text-ink">
          <summary className="cursor-pointer text-ink-muted hover:text-ink">
            {NOT_ON_RECORD_HEADER} ({listed.length})
          </summary>
          <ul className="mt-1.5 space-y-0.5 max-h-36 overflow-y-auto">
            {listed.map((org) => (
              <li key={org.id}>
                <button
                  type="button"
                  onClick={() => onSelect(org.id)}
                  className={`w-full text-left px-1 py-0.5 hover:underline ${
                    org.id === selectedId ? "text-forest-800" : "text-forest-700"
                  }`}
                >
                  {org.name}
                  <span className="text-ink-muted"> · {org.member_count}</span>
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
